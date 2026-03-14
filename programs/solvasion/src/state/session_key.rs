use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct SessionKey {
    /// The player wallet this session key acts on behalf of.
    pub player: Pubkey,
    /// The temporary keypair authorized to sign transactions.
    pub session_key: Pubkey,
    /// Scoped to a specific season.
    pub season_id: u64,
    /// Unix timestamp when this session key expires.
    pub expires_at: i64,
    /// When the session key was created.
    pub created_at: i64,
}

impl SessionKey {
    pub const SEED: &'static [u8] = b"session";

    /// Maximum session key duration: 7 days
    pub const MAX_DURATION: i64 = 7 * 24 * 3600;
}
