use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, Season, SeasonCounters};
use crate::errors::SolvasionError;
use crate::events::SeasonCreated;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateSeasonParams {
    // Timing
    pub land_rush_end: i64,
    pub war_start: i64,
    pub escalation_start: i64,
    pub season_end: i64,
    pub join_cutoff: i64,

    // Map
    pub h3_resolution: u8,

    // Energy
    pub energy_per_hex_per_hour: u16,
    pub energy_per_landmark_per_hour: u16,
    pub energy_cap: u32,
    pub starting_energy: u32,
    pub late_join_bonus_energy: u32,
    pub claim_cost: u32,
    pub min_attack_energy: u32,

    // Attack timing
    pub base_attack_window: i64,
    pub extended_attack_window: i64,
    pub occupation_shield_seconds: i64,
    pub defender_win_cooldown_seconds: i64,
    pub capture_cooldown_seconds: i64,

    // Respawn
    pub max_respawns_per_season: u8,

    // Points
    pub points_per_hex_per_hour: u16,
    pub points_per_landmark_per_hour: u16,
    pub victory_threshold: u64,

    // Escalation
    pub escalation_energy_multiplier_bps: u16,
    pub escalation_attack_cost_multiplier_bps: u16,
    pub escalation_stage_2_start: i64,
    pub escalation_stage_2_energy_multiplier_bps: u16,
    pub escalation_stage_2_attack_cost_multiplier_bps: u16,
    pub escalation_stage_2_landmark_multiplier_bps: u16,

    // Theatre
    pub theatre_capture_bonus_points: u32,
    pub theatre_defence_bonus_points: u32,

    // Combat bonuses
    pub capture_bonus_points: u32,
    pub landmark_capture_bonus_points: u32,
    pub defence_win_bonus_points: u32,
    pub attack_refund_bps: u16,
    pub attack_refund_min_threshold_multiplier: u8,
    pub retaliation_discount_bps: u16,
    pub phantom_recovery_energy: u32,
    pub retaliation_window_seconds: i64,

    // Clutch
    pub clutch_defence_bonus_points: u32,
    pub clutch_window_seconds: i64,

    // Theatre earliest start
    pub theatre_earliest_start: i64,

    // Fortification bonus
    pub fortification_bonus_bps_per_day: u16,
    pub fortification_max_bps: u16,

    // Comeback burst
    pub comeback_energy: u32,
    pub comeback_threshold: u32,
    pub comeback_min_peak: u32,

    // Pacts
    pub pact_break_penalty_points: u32,
    pub pact_max_duration: i64,

    // Landmarks
    pub landmarks: Vec<u64>,
}

#[derive(Accounts)]
pub struct CreateSeason<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = admin,
        space = 8 + Season::INIT_SPACE,
        seeds = [
            Season::SEED,
            (global_config.season_counter + 1).to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        init,
        payer = admin,
        space = 8 + SeasonCounters::INIT_SPACE,
        seeds = [
            SeasonCounters::SEED,
            (global_config.season_counter + 1).to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub season_counters: Account<'info, SeasonCounters>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateSeason>, params: CreateSeasonParams) -> Result<()> {
    require!(!ctx.accounts.global_config.paused, SolvasionError::ProgramPaused);

    let config = &mut ctx.accounts.global_config;
    config.season_counter = config.season_counter
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let season_id = config.season_counter;

    // Validate timing
    require!(params.land_rush_end < params.season_end, SolvasionError::ArithmeticOverflow);
    require!(params.war_start <= params.land_rush_end, SolvasionError::ArithmeticOverflow);
    require!(params.escalation_start <= params.season_end, SolvasionError::ArithmeticOverflow);
    require!(params.landmarks.len() <= 32, SolvasionError::ArithmeticOverflow);

    let now = Clock::get()?.unix_timestamp;

    let season = &mut ctx.accounts.season;
    season.season_id = season_id;
    season.admin = ctx.accounts.admin.key();
    season.created_at = now;
    season.land_rush_end = params.land_rush_end;
    season.war_start = params.war_start;
    season.escalation_start = params.escalation_start;
    season.season_end = params.season_end;
    season.join_cutoff = params.join_cutoff;
    season.actual_end = 0;
    season.has_actual_end = false;
    season.h3_resolution = params.h3_resolution;
    season.map_finalized = false;

    // Energy
    season.energy_per_hex_per_hour = params.energy_per_hex_per_hour;
    season.energy_per_landmark_per_hour = params.energy_per_landmark_per_hour;
    season.energy_cap = params.energy_cap;
    season.starting_energy = params.starting_energy;
    season.late_join_bonus_energy = params.late_join_bonus_energy;
    season.claim_cost = params.claim_cost;
    season.min_attack_energy = params.min_attack_energy;

    // Attack timing
    season.base_attack_window = params.base_attack_window;
    season.extended_attack_window = params.extended_attack_window;
    season.occupation_shield_seconds = params.occupation_shield_seconds;
    season.defender_win_cooldown_seconds = params.defender_win_cooldown_seconds;
    season.capture_cooldown_seconds = params.capture_cooldown_seconds;

    // Respawn
    season.max_respawns_per_season = params.max_respawns_per_season;

    // Points
    season.points_per_hex_per_hour = params.points_per_hex_per_hour;
    season.points_per_landmark_per_hour = params.points_per_landmark_per_hour;
    season.victory_threshold = params.victory_threshold;

    // Escalation
    season.escalation_energy_multiplier_bps = params.escalation_energy_multiplier_bps;
    season.escalation_attack_cost_multiplier_bps = params.escalation_attack_cost_multiplier_bps;
    season.escalation_stage_2_start = params.escalation_stage_2_start;
    season.escalation_stage_2_energy_multiplier_bps = params.escalation_stage_2_energy_multiplier_bps;
    season.escalation_stage_2_attack_cost_multiplier_bps = params.escalation_stage_2_attack_cost_multiplier_bps;
    season.escalation_stage_2_landmark_multiplier_bps = params.escalation_stage_2_landmark_multiplier_bps;

    // Theatre (initialise empty)
    season.active_theatres = [0; 3];
    season.theatre_activated_at = 0;
    season.theatre_expires_at = 0;
    season.theatre_window_index = 0;
    season.theatre_commitment = [0; 32];
    season.theatre_capture_bonus_points = params.theatre_capture_bonus_points;
    season.theatre_defence_bonus_points = params.theatre_defence_bonus_points;

    // Combat bonuses
    season.capture_bonus_points = params.capture_bonus_points;
    season.landmark_capture_bonus_points = params.landmark_capture_bonus_points;
    season.defence_win_bonus_points = params.defence_win_bonus_points;
    season.attack_refund_bps = params.attack_refund_bps;
    season.attack_refund_min_threshold_multiplier = params.attack_refund_min_threshold_multiplier;
    season.retaliation_discount_bps = params.retaliation_discount_bps;
    season.phantom_recovery_energy = params.phantom_recovery_energy;
    season.retaliation_window_seconds = params.retaliation_window_seconds;

    // Clutch
    season.clutch_defence_bonus_points = params.clutch_defence_bonus_points;
    season.clutch_window_seconds = params.clutch_window_seconds;

    // Victory/finalization (not started)
    season.winner = Pubkey::default();
    season.has_winner = false;
    season.winning_score = 0;
    season.finalization_leader = Pubkey::default();
    season.has_finalization_leader = false;
    season.finalization_leader_score = 0;
    season.finalization_complete = false;
    season.cleanup_complete = false;

    // Theatre earliest start
    season.theatre_earliest_start = params.theatre_earliest_start;

    // Fortification
    season.fortification_bonus_bps_per_day = params.fortification_bonus_bps_per_day;
    season.fortification_max_bps = params.fortification_max_bps;

    // Comeback
    season.comeback_energy = params.comeback_energy;
    season.comeback_threshold = params.comeback_threshold;
    season.comeback_min_peak = params.comeback_min_peak;

    // Pacts
    season.pact_break_penalty_points = params.pact_break_penalty_points;
    season.pact_max_duration = params.pact_max_duration;

    // Landmarks
    season.landmark_count = params.landmarks.len() as u8;
    season.landmarks = params.landmarks;

    // Season counters
    let counters = &mut ctx.accounts.season_counters;
    counters.season_id = season_id;
    counters.player_count = 0;
    counters.total_hexes_claimed = 0;
    counters.next_attack_id = 0;
    counters.finalized_count = 0;

    emit!(SeasonCreated {
        season_id,
        start_time: season.created_at,
        end_time: season.season_end,
        landmark_count: season.landmark_count,
    });

    Ok(())
}
