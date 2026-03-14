use anchor_lang::prelude::*;
use crate::state::GlobalConfig;
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.global_config.paused = paused;
    Ok(())
}
