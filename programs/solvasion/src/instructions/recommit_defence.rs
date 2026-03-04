use anchor_lang::prelude::*;
use crate::state::{Season, Player, Hex, Phase};
use crate::errors::SolvasionError;
use crate::helpers::{effective_phase, recalculate_energy};
use crate::crypto::verify_commitment;
use crate::events::DefenceRecommitted;

#[derive(Accounts)]
#[instruction(hex_id: u64)]
pub struct RecommitDefence<'info> {
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

    #[account(
        mut,
        seeds = [
            Hex::SEED,
            season.season_id.to_le_bytes().as_ref(),
            hex_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub hex: Account<'info, Hex>,
}

pub fn handler(
    ctx: Context<RecommitDefence>,
    hex_id: u64,
    old_energy_amount: u32,
    old_blind: [u8; 32],
    new_commitment: [u8; 32],
    new_nonce: u64,
    new_energy_delta: u32,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &mut ctx.accounts.player;
    let hex = &mut ctx.accounts.hex;

    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Verify hex owned by player
    require!(hex.owner == player.player, SolvasionError::NotHexOwner);
    require!(hex.has_commitment, SolvasionError::NoCommitment);
    require!(!hex.commitment_locked, SolvasionError::CommitmentLocked);

    // Verify nonce
    require!(new_nonce == player.commitment_nonce, SolvasionError::InvalidNonce);

    // Pedersen verification of old commitment
    verify_commitment(&hex.defence_commitment, old_energy_amount, &old_blind)?;

    // Recalculate energy
    recalculate_energy(player, season, now)?;

    // Return old energy (capped at energy_cap)
    player.energy_committed = player.energy_committed
        .checked_sub(old_energy_amount)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let new_balance = (player.energy_balance as u64)
        .checked_add(old_energy_amount as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.energy_balance = std::cmp::min(new_balance, season.energy_cap as u64) as u32;

    // Deduct new energy
    require!(
        player.energy_balance >= new_energy_delta,
        SolvasionError::InsufficientEnergy
    );
    player.energy_balance = player.energy_balance
        .checked_sub(new_energy_delta)
        .ok_or(SolvasionError::InsufficientEnergy)?;
    player.energy_committed = player.energy_committed
        .checked_add(new_energy_delta)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Set new commitment
    hex.defence_commitment = new_commitment;
    hex.defence_nonce = new_nonce;

    // Increment nonce
    player.commitment_nonce = player.commitment_nonce
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(DefenceRecommitted {
        season_id: season.season_id,
        player: player.player,
        hex_id,
    });

    Ok(())
}
