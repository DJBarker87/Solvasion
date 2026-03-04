use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Hex {
    pub hex_id: u64,
    pub season_id: u64,
    pub owner: Pubkey,
    pub is_landmark: bool,

    // Defence commitment (Pedersen)
    pub defence_commitment: [u8; 32],
    pub has_commitment: bool,
    pub defence_nonce: u64,

    // Timestamps
    pub claimed_at: i64,
    pub last_owner_change: i64,
    pub last_combat_resolved: i64,

    // Combat state
    pub under_attack: bool,
    pub commitment_locked: bool,

    // Region
    pub region_id: u8,
}

impl Hex {
    pub const SEED: &'static [u8] = b"hex";
}
