use anchor_lang::prelude::*;
use crate::state::{Season, SeasonCounters, GlobalConfig};
use crate::errors::SolvasionError;

/// Close the Season and SeasonCounters accounts after full cleanup.
/// Returns rent to the treasury PDA.
/// For skirmishes: always allowed post-cleanup.
/// For seasons: allowed post-cleanup (cleanup_complete must be true).
#[derive(Accounts)]
pub struct CloseSeason<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [SeasonCounters::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season_counters: Account<'info, SeasonCounters>,

    /// CHECK: Treasury PDA receives rent from closed accounts
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,
}

pub fn handler(ctx: Context<CloseSeason>) -> Result<()> {
    let season = &ctx.accounts.season;

    // Season must be ended
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);

    // Finalization must be complete
    require!(season.finalization_complete, SolvasionError::FinalizationIncomplete);

    // For non-skirmish seasons, cleanup must also be complete
    // (all hex/player accounts closed, reputation updated)
    if !season.is_skirmish {
        require!(season.cleanup_complete, SolvasionError::FinalizationIncomplete);
    }

    let treasury_info = ctx.accounts.treasury.to_account_info();

    // Close Season account
    let season_info = ctx.accounts.season.to_account_info();
    let season_lamports = season_info.lamports();
    **season_info.try_borrow_mut_lamports()? = 0;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(season_lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut season_data = season_info.try_borrow_mut_data()?;
    for byte in season_data.iter_mut() {
        *byte = 0;
    }
    drop(season_data);

    // Close SeasonCounters account
    let counters_info = ctx.accounts.season_counters.to_account_info();
    let counters_lamports = counters_info.lamports();
    **counters_info.try_borrow_mut_lamports()? = 0;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(counters_lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut counters_data = counters_info.try_borrow_mut_data()?;
    for byte in counters_data.iter_mut() {
        *byte = 0;
    }

    Ok(())
}
