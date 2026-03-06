use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pact {
    pub season_id: u64,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub expires_at: i64,
    pub broken: bool,
    pub broken_by: Pubkey,
    pub accepted: bool,
}

impl Pact {
    pub const SEED: &'static [u8] = b"pact";
}
