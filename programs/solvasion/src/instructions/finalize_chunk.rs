use anchor_lang::prelude::*;
use crate::state::{Season, SeasonCounters, Player};
use crate::errors::SolvasionError;
use crate::helpers::recalculate_points_at;
use crate::events::FinalizationProgress;

#[derive(Accounts)]
pub struct FinalizeChunk<'info> {
    pub any_signer: Signer<'info>,

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
    // remaining_accounts: Player accounts (mut) to finalize
}

pub fn handler<'info>(ctx: Context<'_, '_, 'info, 'info, FinalizeChunk<'info>>) -> Result<()> {
    let season = &mut ctx.accounts.season;
    let counters = &mut ctx.accounts.season_counters;

    // Season must be ended
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);

    // Finalization must not already be complete
    require!(!season.finalization_complete, SolvasionError::FinalizationComplete);

    let actual_end = season.actual_end;
    let season_id = season.season_id;

    // Process each player account from remaining_accounts
    for account_info in ctx.remaining_accounts.iter() {
        // Deserialize player account (includes discriminator check)
        let mut player: Account<Player> = Account::try_from(account_info)?;

        // Skip already-finalized players
        if player.finalized {
            continue;
        }

        // Verify player belongs to this season
        require!(player.season_id == season_id, SolvasionError::Unauthorized);

        // Recalculate points using actual_end as the timestamp (NOT current clock)
        recalculate_points_at(&mut player, season, actual_end)?;

        // Mark finalized
        player.finalized = true;

        // Track leader
        if player.points > season.finalization_leader_score || !season.has_finalization_leader {
            season.finalization_leader = player.player;
            season.finalization_leader_score = player.points;
            season.has_finalization_leader = true;
        }

        // Increment finalized count
        counters.finalized_count = counters.finalized_count
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;

        // Write back the modified player data
        player.exit(&crate::ID)?;
    }

    emit!(FinalizationProgress {
        season_id,
        players_processed: counters.finalized_count,
        current_leader: season.finalization_leader,
    });

    Ok(())
}
