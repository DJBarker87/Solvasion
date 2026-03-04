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
}

impl GlobalConfig {
    pub const SEED: &'static [u8] = b"global_config";
}
