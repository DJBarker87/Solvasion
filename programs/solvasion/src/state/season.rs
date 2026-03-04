use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Phase {
    LandRush,
    War,
    EscalationStage1,
    EscalationStage2,
    Ended,
}

#[account]
#[derive(InitSpace)]
pub struct Season {
    pub season_id: u64,
    pub admin: Pubkey,

    // Timing
    pub created_at: i64,
    pub land_rush_end: i64,
    pub war_start: i64,
    pub escalation_start: i64,
    pub season_end: i64,
    pub join_cutoff: i64,
    pub actual_end: i64,        // 0 = not ended yet
    pub has_actual_end: bool,

    // Map
    pub h3_resolution: u8,
    pub map_finalized: bool,

    // Energy params
    pub energy_per_hex_per_hour: u16,
    pub energy_per_landmark_per_hour: u16,
    pub energy_cap: u32,
    pub starting_energy: u32,
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
    pub active_theatres: [u8; 3],
    pub theatre_activated_at: i64,
    pub theatre_expires_at: i64,
    pub theatre_window_index: u32,
    pub theatre_commitment: [u8; 32],
    pub theatre_capture_bonus_points: u32,
    pub theatre_defence_bonus_points: u32,

    // Combat bonuses
    pub capture_bonus_points: u32,
    pub attack_refund_bps: u16,
    pub attack_refund_min_threshold_multiplier: u8,
    pub retaliation_discount_bps: u16,
    pub phantom_recovery_energy: u32,
    pub retaliation_window_seconds: i64,

    // Clutch defence
    pub clutch_defence_bonus_points: u32,
    pub clutch_window_seconds: i64,

    // Victory / finalization
    pub winner: Pubkey,         // Pubkey::default() = no winner
    pub has_winner: bool,
    pub winning_score: u64,
    pub finalization_leader: Pubkey,
    pub has_finalization_leader: bool,
    pub finalization_leader_score: u64,
    pub finalization_complete: bool,
    pub cleanup_complete: bool,

    // Landmarks
    pub landmark_count: u8,
    #[max_len(32)]
    pub landmarks: Vec<u64>,
}

impl Season {
    pub const SEED: &'static [u8] = b"season";
}
