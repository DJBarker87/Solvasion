use anchor_lang::prelude::*;
use crate::state::{Season, Player, Phase};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;
use crate::events::GuardianCleared;

#[derive(Accounts)]
pub struct ClearGuardian<'info> {
    pub player_wallet: Signer<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
        ],
        bump,
        constraint = player.player == player_wallet.key(),
    )]
    pub player: Account<'info, Player>,
}

pub fn handler(ctx: Context<ClearGuardian>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    let player = &mut ctx.accounts.player;
    player.guardian = Pubkey::default();
    player.has_guardian = false;

    emit!(GuardianCleared {
        season_id: season.season_id,
        player: player.player,
    });

    Ok(())
}
