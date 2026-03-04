use anchor_lang::prelude::*;
use crate::state::{Season, Player, Hex, Phase};
use crate::errors::SolvasionError;
use crate::helpers::{effective_phase, recalculate_energy};
use crate::events::DefenceIncreased;

#[derive(Accounts)]
#[instruction(hex_id: u64)]
pub struct IncreaseDefence<'info> {
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
    ctx: Context<IncreaseDefence>,
    hex_id: u64,
    new_commitment: [u8; 32],
    new_nonce: u64,
    delta: u32,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &mut ctx.accounts.player;
    let hex = &mut ctx.accounts.hex;

    // Allowed in ALL phases except Ended (includes LandRush)
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Verify hex owned by player
    require!(hex.owner == player.player, SolvasionError::NotHexOwner);
    require!(hex.has_commitment, SolvasionError::NoCommitment);
    require!(!hex.commitment_locked, SolvasionError::CommitmentLocked);

    // Verify nonce
    require!(new_nonce == player.commitment_nonce, SolvasionError::InvalidNonce);

    // Recalculate energy
    recalculate_energy(player, season, now)?;

    // Verify sufficient energy
    require!(player.energy_balance >= delta, SolvasionError::InsufficientEnergy);

    // Update hex commitment
    hex.defence_commitment = new_commitment;
    hex.defence_nonce = new_nonce;

    // Update player
    player.energy_balance = player.energy_balance
        .checked_sub(delta)
        .ok_or(SolvasionError::InsufficientEnergy)?;
    player.energy_committed = player.energy_committed
        .checked_add(delta)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.commitment_nonce = player.commitment_nonce
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(DefenceIncreased {
        season_id: season.season_id,
        player: player.player,
        hex_id,
        delta,
    });

    Ok(())
}
