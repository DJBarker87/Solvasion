use anchor_lang::prelude::*;
use crate::state::{Season, SeasonCounters, Player, Hex, ValidHexSet, AdjacencySet, Phase};
use crate::errors::SolvasionError;
use crate::helpers::{effective_phase, recalculate_energy, recalculate_points};
use crate::events::HexClaimed;

#[derive(Accounts)]
#[instruction(hex_id: u64)]
pub struct ClaimHex<'info> {
    #[account(mut)]
    pub player_wallet: Signer<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
        constraint = season.map_finalized @ SolvasionError::MapNotFinalized,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [SeasonCounters::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season_counters: Account<'info, SeasonCounters>,

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
        init,
        payer = player_wallet,
        space = 8 + Hex::INIT_SPACE,
        seeds = [
            Hex::SEED,
            season.season_id.to_le_bytes().as_ref(),
            hex_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub hex: Account<'info, Hex>,

    #[account(
        seeds = [
            ValidHexSet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[valid_hex_set.chunk_index],
        ],
        bump,
        constraint = valid_hex_set.season_id == season.season_id,
    )]
    pub valid_hex_set: Account<'info, ValidHexSet>,

    /// Optional: adjacency set for validating adjacency when not first claim.
    /// CHECK: validated via seeds constraint.
    #[account(
        seeds = [
            AdjacencySet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[adjacency_set.chunk_index],
        ],
        bump,
        constraint = adjacency_set.season_id == season.season_id,
    )]
    pub adjacency_set: Account<'info, AdjacencySet>,

    /// Optional: an adjacent hex owned by the player, for adjacency proof.
    /// CHECK: validated in handler logic via PDA derivation and owner check.
    pub adjacent_hex: Option<Account<'info, Hex>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ClaimHex>,
    hex_id: u64,
    initial_commitment: [u8; 32],
    initial_nonce: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let player = &mut ctx.accounts.player;

    // Check phase
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Recalculate energy and points
    recalculate_energy(player, season, now)?;
    recalculate_points(player, season, now)?;

    // Verify sufficient energy
    require!(player.energy_balance >= season.claim_cost, SolvasionError::InsufficientEnergy);

    // Validate hex is in valid hex set (binary search)
    let hex_index = ctx.accounts.valid_hex_set
        .find_hex(hex_id)
        .ok_or(SolvasionError::InvalidHex)?;

    // Adjacency check
    if player.hex_count == 0 {
        // First claim or respawn — adjacency waived
        if player.joined_at != now {
            // This is a respawn (player previously had hexes)
            require!(
                player.respawn_count < season.max_respawns_per_season,
                SolvasionError::RespawnLimitExceeded
            );
            player.respawn_count = player.respawn_count
                .checked_add(1)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
        }
    } else {
        // Must prove adjacency
        let adjacent_hex = ctx.accounts.adjacent_hex
            .as_ref()
            .ok_or(SolvasionError::NotAdjacent)?;

        // Verify the adjacent hex is owned by this player
        require!(adjacent_hex.owner == player.player, SolvasionError::NotAdjacent);
        require!(adjacent_hex.season_id == season.season_id, SolvasionError::NotAdjacent);

        // Verify edge exists in adjacency set
        require!(
            ctx.accounts.adjacency_set.find_edge(hex_id, adjacent_hex.hex_id),
            SolvasionError::NotAdjacent
        );
    }

    // Verify nonce matches
    require!(initial_nonce == player.commitment_nonce, SolvasionError::InitialNonceMismatch);

    // Deduct claim cost
    player.energy_balance = player.energy_balance
        .checked_sub(season.claim_cost)
        .ok_or(SolvasionError::InsufficientEnergy)?;

    // Check if landmark
    let is_landmark = season.landmarks.iter().any(|&lm| lm == hex_id);

    // Get region_id from valid hex set
    let region_id = ctx.accounts.valid_hex_set.region_ids[hex_index];

    // Initialize hex account
    let hex = &mut ctx.accounts.hex;
    hex.hex_id = hex_id;
    hex.season_id = season.season_id;
    hex.owner = player.player;
    hex.is_landmark = is_landmark;
    hex.defence_commitment = initial_commitment;
    hex.has_commitment = true;
    hex.defence_nonce = initial_nonce;
    hex.claimed_at = now;
    hex.last_owner_change = now;
    hex.last_combat_resolved = 0;
    hex.under_attack = false;
    hex.commitment_locked = false;
    hex.region_id = region_id;

    // Update player state
    player.commitment_nonce = player.commitment_nonce
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.hex_count = player.hex_count
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    if is_landmark {
        player.landmark_count = player.landmark_count
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
    }

    // Update season counters
    let counters = &mut ctx.accounts.season_counters;
    counters.total_hexes_claimed = counters.total_hexes_claimed
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(HexClaimed {
        season_id: season.season_id,
        hex_id,
        player: player.player,
        is_landmark,
    });

    Ok(())
}
