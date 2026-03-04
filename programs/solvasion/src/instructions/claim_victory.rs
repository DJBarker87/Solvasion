use anchor_lang::prelude::*;
use crate::state::{Season, Player};
use crate::errors::SolvasionError;
use crate::helpers::recalculate_points;
use crate::events::SeasonEnded;

#[derive(Accounts)]
pub struct ClaimVictory<'info> {
    pub any_signer: Signer<'info>,

    #[account(
        mut,
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player.player.as_ref(),
        ],
        bump,
    )]
    pub player: Account<'info, Player>,
}

pub fn handler(ctx: Context<ClaimVictory>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &mut ctx.accounts.season;
    let player = &mut ctx.accounts.player;

    // Season must not already be ended
    require!(!season.has_actual_end, SolvasionError::SeasonEnded);

    // Recalculate points to current time
    recalculate_points(player, season, now)?;

    // Verify victory threshold reached
    require!(player.points >= season.victory_threshold, SolvasionError::VictoryNotReached);

    // End the season
    season.actual_end = now;
    season.has_actual_end = true;
    season.winner = player.player;
    season.winning_score = player.points;
    season.has_winner = true;
    season.finalization_complete = true; // no crank needed — winner known

    emit!(SeasonEnded {
        season_id: season.season_id,
        end_reason: 0, // victory
    });

    Ok(())
}
