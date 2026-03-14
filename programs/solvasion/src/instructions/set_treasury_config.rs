use anchor_lang::prelude::*;
use crate::state::GlobalConfig;
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct SetTreasuryConfig<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(
    ctx: Context<SetTreasuryConfig>,
    treasury_min_balance: u64,
    max_players_per_season: u32,
) -> Result<()> {
    let config = &mut ctx.accounts.global_config;
    config.treasury_min_balance = treasury_min_balance;
    config.max_players_per_season = max_players_per_season;
    Ok(())
}
