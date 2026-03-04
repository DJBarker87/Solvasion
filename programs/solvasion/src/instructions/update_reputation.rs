use anchor_lang::prelude::*;
use crate::state::{Season, Player, Reputation};
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player.player.as_ref(),
        ],
        bump,
    )]
    pub player: Account<'info, Player>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + Reputation::INIT_SPACE,
        seeds = [Reputation::SEED, player.player.as_ref()],
        bump,
    )]
    pub reputation: Account<'info, Reputation>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<UpdateReputation>) -> Result<()> {
    let season = &ctx.accounts.season;
    let player = &ctx.accounts.player;
    let reputation = &mut ctx.accounts.reputation;

    // Season must be ended and finalization complete
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);
    require!(season.finalization_complete, SolvasionError::FinalizationIncomplete);

    // Player must be finalized
    require!(player.finalized, SolvasionError::PlayerNotFinalized);

    // Set player pubkey (for init_if_needed case)
    reputation.player = player.player;

    // Accumulate lifetime stats
    reputation.seasons_played = reputation.seasons_played
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    if season.has_winner && season.winner == player.player {
        reputation.seasons_won = reputation.seasons_won
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
    }

    reputation.total_attacks_launched = reputation.total_attacks_launched
        .checked_add(player.attacks_launched as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    reputation.total_attacks_won = reputation.total_attacks_won
        .checked_add(player.attacks_won as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    reputation.total_defences_made = reputation.total_defences_made
        .checked_add(player.defences_made as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    reputation.total_defences_won = reputation.total_defences_won
        .checked_add(player.defences_won as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    reputation.total_clutch_defences = reputation.total_clutch_defences
        .checked_add(player.clutch_defences as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Update best season score
    if player.points > reputation.best_season_score {
        reputation.best_season_score = player.points;
    }

    Ok(())
}
