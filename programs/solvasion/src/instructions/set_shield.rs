use anchor_lang::prelude::*;
use crate::state::{Season, Player, Phase};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;

#[derive(Accounts)]
pub struct SetShield<'info> {
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

pub fn handler(ctx: Context<SetShield>, shield_start_hour: u8) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    require!(shield_start_hour <= 23, SolvasionError::InvalidShieldHour);

    let player = &mut ctx.accounts.player;
    player.pending_shield_hour = shield_start_hour;
    player.shield_change_at = now
        .checked_add(86400)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.has_shield_change = true;

    Ok(())
}
