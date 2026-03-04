use anchor_lang::prelude::*;
use crate::state::{Season, Player, PhantomRecovery};
use crate::errors::SolvasionError;
use crate::helpers::recalculate_energy;
use crate::events::PhantomEnergyRecovered;

#[derive(Accounts)]
#[instruction(hex_id: u64)]
pub struct RecoverPhantomEnergy<'info> {
    #[account(mut)]
    pub player_wallet: Signer<'info>,

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
    )]
    pub player: Account<'info, Player>,

    #[account(
        mut,
        seeds = [
            PhantomRecovery::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
            hex_id.to_le_bytes().as_ref(),
        ],
        bump,
        constraint = !phantom_recovery.recovered @ SolvasionError::RecoveryAlreadyClaimed,
    )]
    pub phantom_recovery: Account<'info, PhantomRecovery>,
}

pub fn handler(ctx: Context<RecoverPhantomEnergy>, _hex_id: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &mut ctx.accounts.player;
    let phantom = &mut ctx.accounts.phantom_recovery;

    // Require 24 hours since lost_at
    let recovery_time = phantom.lost_at
        .checked_add(86400) // 24 hours
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    require!(now >= recovery_time, SolvasionError::RecoveryTooEarly);

    // Recalculate energy
    recalculate_energy(player, season, now)?;

    let recovery_amount = phantom.recovery_amount;

    // Return recovery_amount to player's energy_balance (capped)
    let new_balance = (player.energy_balance as u64)
        .checked_add(recovery_amount as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.energy_balance = std::cmp::min(new_balance, season.energy_cap as u64) as u32;

    // Decrement energy_committed and phantom_energy
    player.energy_committed = player.energy_committed
        .saturating_sub(recovery_amount);
    player.phantom_energy = player.phantom_energy
        .saturating_sub(recovery_amount);

    // Mark as recovered
    phantom.recovered = true;

    let season_id = season.season_id;
    let hex_id = phantom.hex_id;

    emit!(PhantomEnergyRecovered {
        season_id,
        player: player.player,
        hex_id,
        energy_recovered: recovery_amount,
    });

    // Close PhantomRecovery account: rent to player wallet
    let phantom_info = ctx.accounts.phantom_recovery.to_account_info();
    let wallet_info = ctx.accounts.player_wallet.to_account_info();
    let lamports = phantom_info.lamports();
    **phantom_info.try_borrow_mut_lamports()? = 0;
    **wallet_info.try_borrow_mut_lamports()? = wallet_info
        .lamports()
        .checked_add(lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut data = phantom_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    Ok(())
}
