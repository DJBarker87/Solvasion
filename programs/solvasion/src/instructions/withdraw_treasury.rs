use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::GlobalConfig;
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// CHECK: Treasury PDA, SOL withdrawn from here
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawTreasury>, amount: u64) -> Result<()> {
    let treasury = &ctx.accounts.treasury;
    let config = &ctx.accounts.global_config;

    // Enforce minimum balance floor — cannot drain treasury below safety threshold
    let min_balance = if config.treasury_min_balance > 0 {
        config.treasury_min_balance
    } else {
        GlobalConfig::DEFAULT_TREASURY_MIN
    };

    let balance_after = treasury.lamports()
        .checked_sub(amount)
        .ok_or(SolvasionError::TreasuryInsufficient)?;
    require!(balance_after >= min_balance, SolvasionError::TreasuryInsufficient);

    let bump = ctx.bumps.treasury;
    let seeds: &[&[u8]] = &[GlobalConfig::TREASURY_SEED, &[bump]];
    let signer_seeds = &[seeds];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.admin.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    Ok(())
}
