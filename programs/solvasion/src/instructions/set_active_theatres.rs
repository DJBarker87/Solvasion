use anchor_lang::prelude::*;
use crate::state::{Season, GlobalConfig, Phase};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;
use crate::events::TheatreActivated;

#[derive(Accounts)]
pub struct SetActiveTheatres<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump,
        constraint = global_config.admin == admin.key() @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handler(
    ctx: Context<SetActiveTheatres>,
    theatre_regions: [u8; 3],
    expires_at: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &mut ctx.accounts.season;

    // Must be in War or Escalation phase
    let phase = effective_phase(season, now);
    require!(
        matches!(phase, Phase::War | Phase::EscalationStage1 | Phase::EscalationStage2),
        SolvasionError::SeasonNotInCombatPhase,
    );

    // Must be past theatre earliest start time
    require!(now >= season.theatre_earliest_start, SolvasionError::TheatreTooEarly);

    // Validate region IDs (1–15, non-zero)
    for &region in theatre_regions.iter() {
        require!(region >= 1 && region <= 15, SolvasionError::InvalidRegionId);
    }

    // No consecutive repeats from previous window
    let prev = season.active_theatres;
    for &region in theatre_regions.iter() {
        require!(
            !prev.iter().any(|&r| r != 0 && r == region),
            SolvasionError::InvalidRegionId,
        );
    }

    // Validate expires_at is in the future and within 49-hour maximum
    require!(expires_at > now, SolvasionError::TheatreWindowTooShort);
    let max_expires = now
        .checked_add(49 * 3600)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    require!(expires_at <= max_expires, SolvasionError::TheatreWindowTooLong);

    season.active_theatres = theatre_regions;
    season.theatre_activated_at = now;
    season.theatre_expires_at = expires_at;
    season.theatre_window_index = season.theatre_window_index
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(TheatreActivated {
        season_id: season.season_id,
        theatre_regions,
        expires_at,
        capture_bonus_points: season.theatre_capture_bonus_points,
        defence_bonus_points: season.theatre_defence_bonus_points,
    });

    Ok(())
}
