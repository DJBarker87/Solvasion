use anchor_lang::prelude::*;
use crate::state::{Season, Phase, Player, GlobalConfig, SessionKey};
use crate::errors::SolvasionError;

/// Verify that `authority` is authorized to act for the player.
/// Accepts either:
///   (a) authority == player.player (direct wallet signing), or
///   (b) authority is a registered, unexpired session key for this player+season
///       (SessionKey PDA passed via remaining_accounts).
pub fn verify_player_authority(
    authority_key: &Pubkey,
    player: &Player,
    remaining_accounts: &[AccountInfo],
    program_id: &Pubkey,
    season_id: u64,
    now: i64,
) -> Result<()> {
    // Direct signing — authority is the player wallet
    if *authority_key == player.player {
        return Ok(());
    }

    // Session key mode — look for SessionKey PDA in remaining_accounts
    let (expected_pda, _) = Pubkey::find_program_address(
        &[
            SessionKey::SEED,
            season_id.to_le_bytes().as_ref(),
            player.player.as_ref(),
        ],
        program_id,
    );

    for account_info in remaining_accounts.iter() {
        if account_info.key() == expected_pda {
            let data = account_info.try_borrow_data()?;
            let session = SessionKey::try_deserialize(&mut &data[..])?;

            require!(session.player == player.player, SolvasionError::Unauthorized);
            require!(session.session_key == *authority_key, SolvasionError::Unauthorized);
            require!(session.season_id == season_id, SolvasionError::Unauthorized);
            require!(session.expires_at > now, SolvasionError::SessionKeyExpired);

            return Ok(());
        }
    }

    Err(SolvasionError::Unauthorized.into())
}

/// Verify the treasury has sufficient balance for account creation.
/// Prevents drain attacks by requiring treasury stays above safety floor.
/// Call this before any `init` that uses treasury as payer.
pub fn require_treasury_funded(
    treasury_lamports: u64,
    config: &GlobalConfig,
    required_rent: u64,
) -> Result<()> {
    let min_balance = if config.treasury_min_balance > 0 {
        config.treasury_min_balance
    } else {
        GlobalConfig::DEFAULT_TREASURY_MIN
    };

    let balance_after = treasury_lamports
        .checked_sub(required_rent)
        .ok_or(SolvasionError::TreasuryBelowSafetyFloor)?;

    require!(
        balance_after >= min_balance,
        SolvasionError::TreasuryBelowSafetyFloor
    );

    Ok(())
}

/// Verify the season hasn't hit the max player cap (anti-spam).
pub fn require_player_cap_not_reached(
    config: &GlobalConfig,
    current_player_count: u32,
) -> Result<()> {
    if config.max_players_per_season > 0 {
        require!(
            current_player_count < config.max_players_per_season,
            SolvasionError::MaxPlayersReached
        );
    }
    Ok(())
}

/// Determine the effective season phase from timestamps.
/// Phase is computed dynamically, not stored.
pub fn effective_phase(season: &Season, now: i64) -> Phase {
    if season.has_actual_end || now >= season.season_end {
        return Phase::Ended;
    }
    if now >= season.escalation_stage_2_start && season.escalation_stage_2_start > 0 {
        return Phase::EscalationStage2;
    }
    if now >= season.escalation_start {
        return Phase::EscalationStage1;
    }
    if now >= season.war_start {
        return Phase::War;
    }
    Phase::LandRush
}

/// Lazy energy recalculation. Must be called before any instruction
/// that reads or modifies energy_balance.
pub fn recalculate_energy(
    player: &mut Player,
    season: &Season,
    now: i64,
) -> Result<()> {
    // Cap at season end to prevent post-season energy accrual
    let effective_now = if season.has_actual_end {
        std::cmp::min(now, season.actual_end)
    } else if now >= season.season_end {
        season.season_end
    } else {
        now
    };

    if player.hex_count == 0 && player.landmark_count == 0 {
        player.last_energy_update = effective_now;
        return Ok(());
    }

    let seconds_elapsed = effective_now
        .checked_sub(player.last_energy_update)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    if seconds_elapsed <= 0 {
        return Ok(());
    }

    let phase = effective_phase(season, now);

    // Base rate: hex_count * energy_per_hex_per_hour + landmark_count * energy_per_landmark_per_hour
    let hex_rate = (player.hex_count as u64)
        .checked_mul(season.energy_per_hex_per_hour as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let landmark_rate = (player.landmark_count as u64)
        .checked_mul(season.energy_per_landmark_per_hour as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut total_rate = hex_rate
        .checked_add(landmark_rate)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Apply escalation multiplier (basis points)
    match phase {
        Phase::EscalationStage1 => {
            total_rate = total_rate
                .checked_mul(season.escalation_energy_multiplier_bps as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?
                .checked_div(10_000)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
        }
        Phase::EscalationStage2 => {
            total_rate = total_rate
                .checked_mul(season.escalation_stage_2_energy_multiplier_bps as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?
                .checked_div(10_000)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
        }
        _ => {}
    }

    // Floor division: (seconds * rate) / rate_divisor
    let energy_earned = (seconds_elapsed as u64)
        .checked_mul(total_rate)
        .ok_or(SolvasionError::ArithmeticOverflow)?
        .checked_div(season.rate_divisor as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    let new_balance = (player.energy_balance as u64)
        .checked_add(energy_earned)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    player.energy_balance = std::cmp::min(new_balance, season.energy_cap as u64) as u32;
    player.last_energy_update = effective_now;

    Ok(())
}

/// Apply pending shield change if the 24-hour delay has passed.
/// Must be called at the start of any instruction that reads the player's shield state.
pub fn apply_pending_shield(player: &mut Player, now: i64) {
    if player.has_shield_change && now >= player.shield_change_at {
        player.shield_start_hour = player.pending_shield_hour;
        player.has_shield_change = false;
        player.shield_change_at = 0;
        player.pending_shield_hour = 0;
    }
}

/// Check if the current UTC time falls within a player's 6-hour shield window.
/// Shield window is [shield_start_hour, shield_start_hour + 6) mod 24.
pub fn is_in_shield_window(shield_start_hour: u8, now: i64) -> bool {
    // Extract current UTC hour from unix timestamp
    let seconds_in_day = now.rem_euclid(86400);
    let current_hour = (seconds_in_day / 3600) as u8;

    let start = shield_start_hour;
    let end = (shield_start_hour + 6) % 24;

    if start < end {
        // Simple range: e.g. 2..8
        current_hour >= start && current_hour < end
    } else {
        // Wraps midnight: e.g. 22..4
        current_hour >= start || current_hour < end
    }
}

/// Recalculate points using a specific timestamp (for finalization).
/// Unlike recalculate_points, this uses `at` instead of current clock.
pub fn recalculate_points_at(
    player: &mut Player,
    season: &Season,
    at: i64,
) -> Result<()> {
    recalculate_points(player, season, at)
}

/// Recalculate points earned from territory. Called lazily like energy.
pub fn recalculate_points(
    player: &mut Player,
    season: &Season,
    now: i64,
) -> Result<()> {
    // Cap at season end to prevent post-season point accrual
    let effective_now = if season.has_actual_end {
        std::cmp::min(now, season.actual_end)
    } else if now >= season.season_end {
        season.season_end
    } else {
        now
    };

    if player.hex_count == 0 && player.landmark_count == 0 {
        player.last_points_update = effective_now;
        return Ok(());
    }

    let seconds_elapsed = effective_now
        .checked_sub(player.last_points_update)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    if seconds_elapsed <= 0 {
        return Ok(());
    }

    let phase = effective_phase(season, now);

    let hex_rate = (player.hex_count as u64)
        .checked_mul(season.points_per_hex_per_hour as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let base_landmark_rate = (player.landmark_count as u64)
        .checked_mul(season.points_per_landmark_per_hour as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Apply Stage 2 landmark multiplier (basis points)
    let landmark_rate = if phase == Phase::EscalationStage2 {
        base_landmark_rate
            .checked_mul(season.escalation_stage_2_landmark_multiplier_bps as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?
            / 10_000
    } else {
        base_landmark_rate
    };

    let total_rate = hex_rate
        .checked_add(landmark_rate)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    let points_earned = (seconds_elapsed as u64)
        .checked_mul(total_rate)
        .ok_or(SolvasionError::ArithmeticOverflow)?
        .checked_div(season.rate_divisor as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    player.points = player.points
        .checked_add(points_earned)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.last_points_update = effective_now;

    Ok(())
}
