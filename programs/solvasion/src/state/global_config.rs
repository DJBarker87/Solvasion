use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    /// Authority for creating seasons and updating config.
    pub admin: Pubkey,
    /// Incrementing counter for unique season IDs.
    pub season_counter: u64,
    /// Emergency pause flag.
    pub paused: bool,
    /// Minimum SOL balance the treasury must retain (prevents drain attacks).
    /// Withdrawals cannot reduce treasury below this floor. Set by admin.
    pub treasury_min_balance: u64,
    /// Maximum accounts that can be created per season (anti-spam cap).
    /// 0 = unlimited. Checked against SeasonCounters.player_count.
    pub max_players_per_season: u32,
    /// Season ID of the currently active (non-skirmish) season. 0 = none.
    /// Only one full season can run at a time; skirmishes are unlimited.
    pub active_season_id: u64,
}

impl GlobalConfig {
    pub const SEED: &'static [u8] = b"global_config";
    pub const TREASURY_SEED: &'static [u8] = b"treasury";

    /// Default minimum treasury balance: 2 SOL (enough for ~600 account creations)
    pub const DEFAULT_TREASURY_MIN: u64 = 2_000_000_000;
}
