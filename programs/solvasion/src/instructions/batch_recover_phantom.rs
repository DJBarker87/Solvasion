use anchor_lang::prelude::*;
use crate::state::{Season, Player, PhantomRecovery, GlobalConfig, SessionKey};
use crate::errors::SolvasionError;
use crate::helpers::recalculate_energy;
use crate::events::BatchPhantomRecovered;

#[derive(Accounts)]
pub struct BatchRecoverPhantom<'info> {
    pub authority: Signer<'info>,

    /// CHECK: Player wallet for PDA derivation. Verified by authority check in handler.
    pub player_wallet: UncheckedAccount<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
        ],
        bump,
        constraint = player.player == player_wallet.key(),
    )]
    pub player: Account<'info, Player>,

    /// CHECK: Treasury PDA receives rent from closed accounts
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,
    // PhantomRecovery accounts + optional session key PDA passed via remaining_accounts
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, BatchRecoverPhantom<'info>>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &mut ctx.accounts.player;
    let season_id = season.season_id;
    let player_key = player.player;

    crate::helpers::verify_player_authority(
        &ctx.accounts.authority.key(),
        player,
        ctx.remaining_accounts,
        ctx.program_id,
        season_id,
        now,
    )?;

    // Recalculate energy once
    recalculate_energy(player, season, now)?;

    let remaining = ctx.remaining_accounts;
    require!(!remaining.is_empty(), SolvasionError::ArithmeticOverflow);

    // Compute session key PDA to skip it when iterating remaining_accounts
    let (session_key_pda, _) = Pubkey::find_program_address(
        &[
            SessionKey::SEED,
            season_id.to_le_bytes().as_ref(),
            player_key.as_ref(),
        ],
        ctx.program_id,
    );

    let mut total_recovered: u32 = 0;
    let mut count: u8 = 0;

    for account_info in remaining.iter() {
        // Skip session key PDA (used for session key auth verification)
        if account_info.key() == session_key_pda {
            continue;
        }
        // Deserialize PhantomRecovery
        let data = account_info.try_borrow_mut_data()?;
        // Skip 8-byte discriminator
        let phantom: PhantomRecovery = PhantomRecovery::try_deserialize(&mut &data[..])?;

        // Validate
        require!(phantom.season_id == season_id, SolvasionError::ArithmeticOverflow);
        require!(phantom.player == player_key, SolvasionError::NotDefender);
        require!(!phantom.recovered, SolvasionError::RecoveryAlreadyClaimed);

        // 24-hour cooldown
        let recovery_time = phantom.lost_at
            .checked_add(86400)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        require!(now >= recovery_time, SolvasionError::RecoveryTooEarly);

        // Verify PDA
        let (expected_key, _bump) = Pubkey::find_program_address(
            &[
                PhantomRecovery::SEED,
                season_id.to_le_bytes().as_ref(),
                player_key.as_ref(),
                phantom.hex_id.to_le_bytes().as_ref(),
            ],
            ctx.program_id,
        );
        require!(account_info.key() == expected_key, SolvasionError::InvalidHex);

        let recovery_amount = phantom.recovery_amount;

        // Add energy to player (capped)
        let new_balance = (player.energy_balance as u64)
            .checked_add(recovery_amount as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        player.energy_balance = std::cmp::min(new_balance, season.energy_cap as u64) as u32;

        // Decrement energy_committed and phantom_energy
        player.energy_committed = player.energy_committed
            .saturating_sub(recovery_amount);
        player.phantom_energy = player.phantom_energy
            .saturating_sub(recovery_amount);

        total_recovered = total_recovered
            .checked_add(recovery_amount)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        count = count
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;

        // Close account: zero data, transfer lamports to treasury
        // First mark recovered (write back)
        drop(data);
        let lamports = account_info.lamports();
        **account_info.try_borrow_mut_lamports()? = 0;
        let treasury_info = ctx.accounts.treasury.to_account_info();
        **treasury_info.try_borrow_mut_lamports()? = treasury_info
            .lamports()
            .checked_add(lamports)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        let mut data = account_info.try_borrow_mut_data()?;
        for byte in data.iter_mut() {
            *byte = 0;
        }
    }

    emit!(BatchPhantomRecovered {
        season_id,
        player: player_key,
        count,
        total_energy_recovered: total_recovered,
    });

    Ok(())
}
