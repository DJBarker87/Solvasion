use anchor_lang::prelude::*;
use crate::state::{Season, Player, Hex, Phase};
use crate::errors::SolvasionError;
use crate::helpers::{effective_phase, recalculate_energy};
use crate::events::DefencesCommitted;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CommitmentEntry {
    pub hex_id: u64,
    pub commitment: [u8; 32],
    pub nonce: u64,
}

#[derive(Accounts)]
pub struct CommitDefence<'info> {
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
    // Hex accounts passed via remaining_accounts
}

pub fn handler(
    ctx: Context<CommitDefence>,
    commitments: Vec<CommitmentEntry>,
    total_energy_delta: u32,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &mut ctx.accounts.player;

    // Must be in War or Escalation phase (not LandRush)
    let phase = effective_phase(season, now);
    require!(
        phase == Phase::War || phase == Phase::EscalationStage1 || phase == Phase::EscalationStage2,
        SolvasionError::SeasonNotInCombatPhase
    );

    // Recalculate energy
    recalculate_energy(player, season, now)?;

    // Verify sufficient energy
    require!(
        player.energy_balance >= total_energy_delta,
        SolvasionError::InsufficientEnergy
    );

    let season_id = season.season_id;
    let program_id = ctx.program_id;
    let remaining = &ctx.remaining_accounts;

    require!(
        remaining.len() == commitments.len(),
        SolvasionError::InvalidHex
    );

    for (i, entry) in commitments.iter().enumerate() {
        // Verify nonce sequence
        let expected_nonce = player.commitment_nonce
            .checked_add(i as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        require!(entry.nonce == expected_nonce, SolvasionError::InvalidNonce);

        // Verify hex PDA
        let hex_account_info = &remaining[i];
        let (expected_pda, _bump) = Pubkey::find_program_address(
            &[
                Hex::SEED,
                season_id.to_le_bytes().as_ref(),
                entry.hex_id.to_le_bytes().as_ref(),
            ],
            program_id,
        );
        require!(hex_account_info.key() == expected_pda, SolvasionError::InvalidHex);

        // Deserialize, validate, and update the hex
        let mut hex_data = hex_account_info.try_borrow_mut_data()?;
        let mut hex: Hex = Hex::try_deserialize(&mut &hex_data[..])?;

        require!(hex.owner == player.player, SolvasionError::NotHexOwner);
        require!(!hex.commitment_locked, SolvasionError::CommitmentLocked);
        require!(!hex.has_commitment, SolvasionError::CommitmentExists);

        hex.defence_commitment = entry.commitment;
        hex.has_commitment = true;
        hex.defence_nonce = entry.nonce;

        // Re-serialize back
        let mut writer = &mut hex_data[..];
        hex.try_serialize(&mut writer)?;
    }

    // Update player state
    let count = commitments.len() as u64;
    player.commitment_nonce = player.commitment_nonce
        .checked_add(count)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.energy_balance = player.energy_balance
        .checked_sub(total_energy_delta)
        .ok_or(SolvasionError::InsufficientEnergy)?;
    player.energy_committed = player.energy_committed
        .checked_add(total_energy_delta)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(DefencesCommitted {
        season_id,
        player: player.player,
        hex_count: commitments.len() as u32,
        total_energy_delta,
    });

    Ok(())
}
