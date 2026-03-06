use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Player {
    pub player: Pubkey,
    pub season_id: u64,

    // Energy
    pub energy_balance: u32,
    pub energy_committed: u32,
    pub last_energy_update: i64,

    // Territory
    pub hex_count: u32,
    pub landmark_count: u8,

    // Points
    pub points: u64,
    pub last_points_update: i64,

    // Identity
    pub banner_nft: Pubkey,     // Pubkey::default() = none
    pub has_banner_nft: bool,
    pub joined_at: i64,

    // Commitment tracking
    pub commitment_nonce: u64,

    // Shield
    pub shield_start_hour: u8,
    pub shield_change_at: i64,  // 0 = no pending change
    pub has_shield_change: bool,
    pub pending_shield_hour: u8,

    // Stats
    pub attacks_launched: u32,
    pub attacks_won: u32,
    pub defences_made: u32,
    pub defences_won: u32,
    pub clutch_defences: u32,

    // Season end
    pub finalized: bool,

    // Phantom energy
    pub phantom_energy: u32,

    // Respawn
    pub respawn_count: u8,

    // Retaliation
    pub retaliation_target: Pubkey,  // Pubkey::default() = none
    pub has_retaliation_target: bool,
    pub retaliation_expires: i64,    // 0 = no active token
    pub has_retaliation_expires: bool,
    pub retaliation_discount_bps: u16,

    // Posture
    pub posture_type: u8,
    pub posture_target: u64,
    pub posture_target_player: Pubkey,  // Pubkey::default() = none
    pub has_posture_target_player: bool,
    pub posture_expires: i64,           // 0 = no expiry
    pub has_posture_expires: bool,

    // Guardian
    pub guardian: Pubkey,        // Pubkey::default() = none
    pub has_guardian: bool,

    // Fortification / Comeback
    pub peak_hex_count: u32,
    pub comeback_used: bool,
}

impl Player {
    pub const SEED: &'static [u8] = b"player";
}
