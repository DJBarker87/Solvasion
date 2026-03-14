use anchor_lang::prelude::*;
use crate::state::{Season, Pact, GlobalConfig};
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct ClosePact<'info> {
    pub any_signer: Signer<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [
            Pact::SEED,
            season.season_id.to_le_bytes().as_ref(),
            pact.player_a.as_ref(),
            pact.player_b.as_ref(),
        ],
        bump,
        constraint = pact.season_id == season.season_id,
    )]
    pub pact: Account<'info, Pact>,

    /// CHECK: Treasury PDA receives rent
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,
}

pub fn handler(ctx: Context<ClosePact>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let pact = &ctx.accounts.pact;

    // Can only close if: season ended, OR pact expired, OR pact broken
    let can_close = ctx.accounts.season.has_actual_end
        || now >= pact.expires_at
        || pact.broken;
    require!(can_close, SolvasionError::DeadlineNotPassed);

    // Close pact account: drain lamports to treasury, zero data
    let pact_info = ctx.accounts.pact.to_account_info();
    let treasury_info = ctx.accounts.treasury.to_account_info();
    let lamports = pact_info.lamports();
    **pact_info.try_borrow_mut_lamports()? = 0;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut data = pact_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    Ok(())
}
