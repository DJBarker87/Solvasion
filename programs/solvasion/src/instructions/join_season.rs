use anchor_lang::prelude::*;
use crate::state::{Season, SeasonCounters, Player};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;
use crate::state::Phase;
use crate::events::PlayerJoined;

#[derive(Accounts)]
pub struct JoinSeason<'info> {
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
        constraint = season_counters.season_id == season.season_id,
    )]
    pub season_counters: Account<'info, SeasonCounters>,

    #[account(
        init,
        payer = player_wallet,
        space = 8 + Player::INIT_SPACE,
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
        ],
        bump,
    )]
    pub player: Account<'info, Player>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<JoinSeason>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;

    // Verify season not ended
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Verify before join cutoff
    require!(now <= season.join_cutoff, SolvasionError::JoinCutoffPassed);

    let player = &mut ctx.accounts.player;
    player.player = ctx.accounts.player_wallet.key();
    player.season_id = season.season_id;
    player.energy_balance = season.starting_energy;
    player.energy_committed = 0;
    player.last_energy_update = now;
    player.hex_count = 0;
    player.landmark_count = 0;
    player.points = 0;
    player.last_points_update = now;
    player.banner_nft = Pubkey::default();
    player.has_banner_nft = false;
    player.joined_at = now;
    player.commitment_nonce = 0;
    player.shield_start_hour = 22;
    player.shield_change_at = 0;
    player.has_shield_change = false;
    player.pending_shield_hour = 0;
    player.attacks_launched = 0;
    player.attacks_won = 0;
    player.defences_made = 0;
    player.defences_won = 0;
    player.clutch_defences = 0;
    player.finalized = false;
    player.phantom_energy = 0;
    player.respawn_count = 0;
    player.retaliation_target = Pubkey::default();
    player.has_retaliation_target = false;
    player.retaliation_expires = 0;
    player.has_retaliation_expires = false;
    player.retaliation_discount_bps = 0;
    player.posture_type = 0;
    player.posture_target = 0;
    player.posture_target_player = Pubkey::default();
    player.has_posture_target_player = false;
    player.posture_expires = 0;
    player.has_posture_expires = false;
    player.guardian = Pubkey::default();
    player.has_guardian = false;

    // Increment player count
    let counters = &mut ctx.accounts.season_counters;
    counters.player_count = counters.player_count
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(PlayerJoined {
        season_id: season.season_id,
        player: player.player,
        joined_at: now,
        starting_energy: player.energy_balance,
    });

    Ok(())
}
