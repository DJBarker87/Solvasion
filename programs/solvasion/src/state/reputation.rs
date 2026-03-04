use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Reputation {
    pub player: Pubkey,
    pub seasons_played: u32,
    pub seasons_won: u32,
    pub total_hexes_captured: u64,
    pub total_attacks_launched: u64,
    pub total_attacks_won: u64,
    pub total_defences_made: u64,
    pub total_defences_won: u64,
    pub best_season_rank: u32,
    pub best_season_score: u64,
    pub total_clutch_defences: u64,
}

impl Reputation {
    pub const SEED: &'static [u8] = b"reputation";
}
