use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AttackResult {
    Pending,
    AttackerWon,
    DefenderWon,
    DefaultWin,
}

#[account]
#[derive(InitSpace)]
pub struct Attack {
    pub attack_id: u64,
    pub season_id: u64,
    pub attacker: Pubkey,
    pub target_hex: u64,
    pub origin_hex: u64,
    pub energy_committed: u32,
    pub defender: Pubkey,
    pub launched_at: i64,
    pub deadline: i64,
    pub resolved: bool,
    pub result: AttackResult,
}

impl Attack {
    pub const SEED: &'static [u8] = b"attack";
}
