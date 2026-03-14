use anchor_lang::prelude::*;
use crate::state::GlobalConfig;
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.global_config.admin = new_admin;
    Ok(())
}
