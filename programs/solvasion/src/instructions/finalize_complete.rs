use anchor_lang::prelude::*;
use crate::state::{Season, SeasonCounters};
use crate::errors::SolvasionError;
use crate::events::SeasonFinalized;

#[derive(Accounts)]
pub struct FinalizeComplete<'info> {
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

pub fn handler(ctx: Context<FinalizeComplete>) -> Result<()> {
    let season = &mut ctx.accounts.season;
    let counters = &ctx.accounts.season_counters;

    // Season must be ended
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);

    // Finalization must not already be complete
    require!(!season.finalization_complete, SolvasionError::FinalizationComplete);

    // All players must be finalized
    require!(
        counters.finalized_count == counters.player_count,
        SolvasionError::FinalizationIncomplete,
    );

    // Copy leader to winner
    season.winner = season.finalization_leader;
    season.winning_score = season.finalization_leader_score;
    season.has_winner = true;
    season.finalization_complete = true;

    emit!(SeasonFinalized {
        season_id: season.season_id,
        winner: season.winner,
        winning_score: season.winning_score,
    });

    Ok(())
}
