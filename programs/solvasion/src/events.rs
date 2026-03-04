use anchor_lang::prelude::*;

#[event]
pub struct SeasonCreated {
    pub season_id: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub landmark_count: u8,
}

#[event]
pub struct MapFinalized {
    pub season_id: u64,
    pub hex_count: u32,
    pub edge_count: u32,
}

#[event]
pub struct PlayerJoined {
    pub season_id: u64,
    pub player: Pubkey,
    pub joined_at: i64,
    pub starting_energy: u32,
}

#[event]
pub struct HexClaimed {
    pub season_id: u64,
    pub hex_id: u64,
    pub player: Pubkey,
    pub is_landmark: bool,
}

#[event]
pub struct DefencesCommitted {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_count: u32,
    pub total_energy_delta: u32,
}

#[event]
pub struct DefenceWithdrawn {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_id: u64,
    pub energy_amount: u32,
}

#[event]
pub struct DefenceRecommitted {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_id: u64,
}

#[event]
pub struct DefenceIncreased {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_id: u64,
    pub delta: u32,
}

#[event]
pub struct AttackLaunched {
    pub season_id: u64,
    pub attack_id: u64,
    pub attacker: Pubkey,
    pub defender: Pubkey,
    pub target_hex: u64,
    pub energy: u32,
    pub deadline: i64,
}

#[event]
pub struct AttackResolved {
    pub season_id: u64,
    pub attack_id: u64,
    pub hex_id: u64,
    pub attacker: Pubkey,
    pub defender: Pubkey,
    pub attacker_committed: u32,
    pub defender_revealed: u32,
    pub outcome: u8, // 0 = AttackerWins, 1 = DefenderWins, 2 = Timeout
    pub attacker_surplus_returned: u32,
    pub attacker_refund: u32,
    pub cooldown_end: i64,
    pub guardian_reveal: bool,
}

#[event]
pub struct VictoryThresholdReached {
    pub season_id: u64,
    pub player: Pubkey,
    pub score: u64,
}

#[event]
pub struct PhantomEnergyRecovered {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_id: u64,
    pub energy_recovered: u32,
}

#[event]
pub struct TheatreActivated {
    pub season_id: u64,
    pub theatre_regions: [u8; 3],
    pub expires_at: i64,
    pub capture_bonus_points: u32,
    pub defence_bonus_points: u32,
}

#[event]
pub struct TheatreBonusAwarded {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_id: u64,
    pub bonus_type: u8, // 0 = capture, 1 = defence
    pub points: u32,
}

#[event]
pub struct AttackRefunded {
    pub season_id: u64,
    pub attack_id: u64,
    pub player: Pubkey,
    pub refund_amount: u32,
}

#[event]
pub struct RetaliationTokenGranted {
    pub season_id: u64,
    pub player: Pubkey,
    pub target: Pubkey,
    pub expires_at: i64,
    pub discount_bps: u16,
}

#[event]
pub struct RetaliationTokenUsed {
    pub season_id: u64,
    pub player: Pubkey,
    pub target: Pubkey,
    pub attack_id: u64,
    pub discount_applied: u16,
}

#[event]
pub struct PostureSet {
    pub season_id: u64,
    pub player: Pubkey,
    pub posture_type: u8,
    pub target: u64,
    pub expires_at: i64,
}

#[event]
pub struct SeasonEnded {
    pub season_id: u64,
    pub end_reason: u8, // 0 = victory, 1 = time expired
}

#[event]
pub struct SeasonFinalized {
    pub season_id: u64,
    pub winner: Pubkey,
    pub winning_score: u64,
}

#[event]
pub struct PhaseChanged {
    pub season_id: u64,
    pub new_phase: u8,
    pub timestamp: i64,
}

#[event]
pub struct FinalizationProgress {
    pub season_id: u64,
    pub players_processed: u32,
    pub current_leader: Pubkey,
}

#[event]
pub struct HexAccountClosed {
    pub season_id: u64,
    pub hex_id: u64,
    pub rent_returned_to: Pubkey,
}

#[event]
pub struct PlayerAccountClosed {
    pub season_id: u64,
    pub player: Pubkey,
    pub rent_returned_to: Pubkey,
}

#[event]
pub struct GuardianSet {
    pub season_id: u64,
    pub player: Pubkey,
    pub guardian_pubkey: Pubkey,
}

#[event]
pub struct GuardianCleared {
    pub season_id: u64,
    pub player: Pubkey,
}

#[event]
pub struct ClutchDefence {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_id: u64,
    pub attack_id: u64,
    pub bonus_points: u32,
}

#[event]
pub struct GuardianRevealSubmitted {
    pub season_id: u64,
    pub attack_id: u64,
    pub hex_id: u64,
    pub guardian_pubkey: Pubkey,
}
