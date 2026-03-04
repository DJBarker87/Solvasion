use anchor_lang::prelude::*;
use crate::state::{Season, Player, Hex, Phase};
use crate::errors::SolvasionError;
use crate::helpers::{effective_phase, recalculate_energy};
use crate::crypto::verify_commitment;
use crate::events::DefenceWithdrawn;

#[derive(Accounts)]
#[instruction(hex_id: u64)]
pub struct WithdrawDefence<'info> {
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
    ctx: Context<WithdrawDefence>,
    hex_id: u64,
    energy_amount: u32,
    blind: [u8; 32],
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

    // Pedersen verification
    verify_commitment(&hex.defence_commitment, energy_amount, &blind)?;

    // Recalculate energy before returning
    recalculate_energy(player, season, now)?;

    // Clear commitment
    hex.defence_commitment = [0u8; 32];
    hex.has_commitment = false;
    hex.defence_nonce = 0;

    // Return energy to player (capped at energy_cap)
    player.energy_committed = player.energy_committed
        .checked_sub(energy_amount)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let new_balance = (player.energy_balance as u64)
        .checked_add(energy_amount as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.energy_balance = std::cmp::min(new_balance, season.energy_cap as u64) as u32;

    emit!(DefenceWithdrawn {
        season_id: season.season_id,
        player: player.player,
        hex_id,
        energy_amount,
    });

    Ok(())
}
