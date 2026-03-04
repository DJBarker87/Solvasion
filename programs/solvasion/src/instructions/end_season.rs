use anchor_lang::prelude::*;
use crate::state::{Season, SeasonCounters};
use crate::errors::SolvasionError;
use crate::events::SeasonEnded;

#[derive(Accounts)]
pub struct EndSeason<'info> {
    pub any_signer: Signer<'info>,

    #[account(
        mut,
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        seeds = [SeasonCounters::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season_counters: Account<'info, SeasonCounters>,
}

pub fn handler(ctx: Context<EndSeason>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &mut ctx.accounts.season;

    // Season must not already be ended
    require!(!season.has_actual_end, SolvasionError::SeasonEnded);

    // Time must have expired
    require!(now >= season.season_end, SolvasionError::DeadlineNotPassed);

    season.actual_end = now;
    season.has_actual_end = true;
    season.finalization_complete = false;

    emit!(SeasonEnded {
        season_id: season.season_id,
        end_reason: 1, // time expired
    });

    Ok(())
}
