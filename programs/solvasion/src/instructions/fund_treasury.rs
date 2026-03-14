use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::GlobalConfig;
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// CHECK: Treasury PDA, receives SOL deposits
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.admin.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        amount,
    )?;
    Ok(())
}
