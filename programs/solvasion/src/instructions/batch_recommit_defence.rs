use anchor_lang::prelude::*;
use crate::state::{Season, Player, Hex, Phase};
use crate::errors::SolvasionError;
use crate::helpers::{effective_phase, recalculate_energy};
use crate::crypto::verify_commitment;
use crate::events::BatchDefenceRecommitted;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RecommitEntry {
    pub hex_id: u64,
    pub old_energy: u32,
    pub old_blind: [u8; 32],
    pub new_commitment: [u8; 32],
    pub new_nonce: u64,
    pub new_delta: u32,
}

#[derive(Accounts)]
pub struct BatchRecommitDefence<'info> {
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
        constraint = player.player == player_wallet.key(),
    )]
    pub player: Account<'info, Player>,
    // Hex accounts passed via remaining_accounts (one per entry, same order)
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, BatchRecommitDefence<'info>>,
    entries: Vec<RecommitEntry>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &mut ctx.accounts.player;
    let season_id = season.season_id;

    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Recalculate energy once
    recalculate_energy(player, season, now)?;

    let remaining = ctx.remaining_accounts;
    require!(entries.len() == remaining.len(), SolvasionError::ArithmeticOverflow);
    require!(!entries.is_empty(), SolvasionError::ArithmeticOverflow);

    // Track net energy change: positive means player needs more energy, negative means refund
    let mut total_old_energy: u64 = 0;
    let mut total_new_delta: u64 = 0;

    // Process nonce — entries must use consecutive nonces starting at current commitment_nonce
    let starting_nonce = player.commitment_nonce;

    for (i, entry) in entries.iter().enumerate() {
        let account_info = &remaining[i];

        // Verify PDA
        let (expected_key, _bump) = Pubkey::find_program_address(
            &[
                Hex::SEED,
                season_id.to_le_bytes().as_ref(),
                entry.hex_id.to_le_bytes().as_ref(),
            ],
            ctx.program_id,
        );
        require!(account_info.key() == expected_key, SolvasionError::InvalidHex);

        // Deserialize hex
        let mut hex: Hex = {
            let data = account_info.try_borrow_data()?;
            Hex::try_deserialize(&mut &data[..])?
        };

        // Validate
        require!(hex.owner == player.player, SolvasionError::NotHexOwner);
        require!(hex.has_commitment, SolvasionError::NoCommitment);
        require!(!hex.commitment_locked, SolvasionError::CommitmentLocked);

        // Verify nonce
        let expected_nonce = starting_nonce
            .checked_add(i as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        require!(entry.new_nonce == expected_nonce, SolvasionError::InvalidNonce);

        // Verify old commitment via Pedersen
        verify_commitment(&hex.defence_commitment, entry.old_energy, &entry.old_blind)?;

        // Update hex with new commitment
        hex.defence_commitment = entry.new_commitment;
        hex.defence_nonce = entry.new_nonce;

        // Serialize hex back
        let mut data = account_info.try_borrow_mut_data()?;
        hex.try_serialize(&mut &mut data[..])?;

        // Accumulate energy changes
        total_old_energy = total_old_energy
            .checked_add(entry.old_energy as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        total_new_delta = total_new_delta
            .checked_add(entry.new_delta as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
    }

    // Update player nonce
    player.commitment_nonce = starting_nonce
        .checked_add(entries.len() as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Return old energy to balance
    player.energy_committed = player.energy_committed
        .checked_sub(total_old_energy as u32)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let new_balance = (player.energy_balance as u64)
        .checked_add(total_old_energy)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.energy_balance = std::cmp::min(new_balance, season.energy_cap as u64) as u32;

    // Deduct new energy
    require!(
        player.energy_balance >= total_new_delta as u32,
        SolvasionError::InsufficientEnergy
    );
    player.energy_balance = player.energy_balance
        .checked_sub(total_new_delta as u32)
        .ok_or(SolvasionError::InsufficientEnergy)?;
    player.energy_committed = player.energy_committed
        .checked_add(total_new_delta as u32)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Net delta for event (can be negative)
    let net_delta = (total_new_delta as i64)
        .checked_sub(total_old_energy as i64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(BatchDefenceRecommitted {
        season_id,
        player: player.player,
        count: entries.len() as u8,
        net_energy_delta: net_delta,
    });

    Ok(())
}
