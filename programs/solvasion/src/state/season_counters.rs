use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SeasonCounters {
    pub season_id: u64,
    pub player_count: u32,
    pub total_hexes_claimed: u32,
    pub next_attack_id: u64,
    pub finalized_count: u32,
}

impl SeasonCounters {
    pub const SEED: &'static [u8] = b"season_counters";
}
