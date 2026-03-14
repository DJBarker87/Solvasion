use anchor_lang::prelude::*;
use crate::state::GlobalConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GlobalConfig::SEED],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.global_config;
    config.admin = ctx.accounts.admin.key();
    config.season_counter = 0;
    config.paused = false;
    config.treasury_min_balance = GlobalConfig::DEFAULT_TREASURY_MIN;
    config.max_players_per_season = 0; // 0 = unlimited
    config.active_season_id = 0;
    Ok(())
}
