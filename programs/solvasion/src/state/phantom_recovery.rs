use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PhantomRecovery {
    pub season_id: u64,
    pub player: Pubkey,
    pub hex_id: u64,
    pub recovery_amount: u32,
    pub lost_at: i64,
    pub recovered: bool,
}

impl PhantomRecovery {
    pub const SEED: &'static [u8] = b"phantom";
}
