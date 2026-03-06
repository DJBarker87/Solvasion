use anchor_lang::prelude::*;
use crate::state::{Season, Player, Hex, Attack, AttackResult};
use crate::errors::SolvasionError;
use crate::helpers::recalculate_points;
use crate::crypto::verify_commitment;
use crate::events::{
    AttackResolved, GuardianRevealSubmitted, TheatreBonusAwarded,
    AttackRefunded, RetaliationTokenGranted, VictoryThresholdReached,
    ClutchDefence, LandmarkCaptureBonus, ComebackBurst,
};

#[derive(Accounts)]
#[instruction(attack_id: u64)]
pub struct RevealDefence<'info> {
    pub caller: Signer<'info>,

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
            attack.defender.as_ref(),
        ],
        bump,
    )]
    pub player_defender: Account<'info, Player>,

    #[account(
        mut,
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            attack.attacker.as_ref(),
        ],
        bump,
    )]
    pub player_attacker: Account<'info, Player>,

    #[account(
        mut,
        seeds = [
            Hex::SEED,
            season.season_id.to_le_bytes().as_ref(),
            attack.target_hex.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub hex: Account<'info, Hex>,

    #[account(
        mut,
        seeds = [
            Attack::SEED,
            season.season_id.to_le_bytes().as_ref(),
            attack_id.to_le_bytes().as_ref(),
        ],
        bump,
        constraint = !attack.resolved @ SolvasionError::AttackAlreadyResolved,
    )]
    pub attack: Account<'info, Attack>,

    /// CHECK: Receives rent from closed attack account. Must match attack.attacker.
    #[account(
        mut,
        constraint = attacker_rent_recipient.key() == attack.attacker @ SolvasionError::InvalidRecipient,
    )]
    pub attacker_rent_recipient: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<RevealDefence>,
    _attack_id: u64,
    energy_amount: u32,
    blind: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let defender = &mut ctx.accounts.player_defender;
    let attacker = &mut ctx.accounts.player_attacker;
    let hex = &mut ctx.accounts.hex;
    let attack = &mut ctx.accounts.attack;
    let caller = &ctx.accounts.caller;

    // Step 1: Caller verification — owner or registered guardian
    let guardian_reveal;
    if caller.key() == attack.defender {
        guardian_reveal = false;
    } else if defender.has_guardian && defender.guardian == caller.key() {
        guardian_reveal = true;
        emit!(GuardianRevealSubmitted {
            season_id: season.season_id,
            attack_id: attack.attack_id,
            hex_id: hex.hex_id,
            guardian_pubkey: caller.key(),
        });
    } else {
        return Err(SolvasionError::NotAuthorisedToReveal.into());
    }

    // Step 2: Pre-resolution checks
    require!(now <= attack.deadline, SolvasionError::DeadlinePassed);

    // Pedersen verification
    verify_commitment(&hex.defence_commitment, energy_amount, &blind)?;

    // Step 3: Recalculate points for both players
    recalculate_points(defender, season, now)?;
    recalculate_points(attacker, season, now)?;

    // Step 4: Resolve combat
    let hex_id = hex.hex_id;
    let season_id = season.season_id;
    let attacker_committed = attack.energy_committed;
    let mut attacker_surplus_returned: u32 = 0;
    let mut attacker_refund: u32 = 0;
    let outcome: u8;
    let cooldown_end: i64;

    // Check theatre eligibility
    let in_theatre = season.active_theatres.iter().any(|&r| r != 0 && r == hex.region_id)
        && now < season.theatre_expires_at;

    // Calculate fortification bonus
    let days_held = ((now - hex.last_owner_change) / 86400) as u16;
    let fortification_bps = std::cmp::min(
        days_held.saturating_mul(season.fortification_bonus_bps_per_day),
        season.fortification_max_bps,
    );
    let effective_defence = (energy_amount as u64)
        .checked_mul(10_000u64.checked_add(fortification_bps as u64).ok_or(SolvasionError::ArithmeticOverflow)?)
        .ok_or(SolvasionError::ArithmeticOverflow)?
        / 10_000;

    if (attacker_committed as u64) > effective_defence {
        // ---- ATTACKER WINS ----
        outcome = 0; // AttackerWins

        // Surplus returned to attacker
        let surplus = attacker_committed
            .checked_sub(energy_amount)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        let new_atk_balance = (attacker.energy_balance as u64)
            .checked_add(surplus as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        attacker.energy_balance = std::cmp::min(new_atk_balance, season.energy_cap as u64) as u32;
        attacker_surplus_returned = surplus;

        // Deduct defender's energy_committed by revealed amount.
        // Use saturating_sub because claim_hex commitments are not tracked in energy_committed.
        defender.energy_committed = defender.energy_committed.saturating_sub(energy_amount);

        // Transfer hex ownership
        let is_landmark = hex.is_landmark;
        defender.hex_count = defender.hex_count
            .checked_sub(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        if is_landmark {
            defender.landmark_count = defender.landmark_count
                .checked_sub(1)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
        }
        attacker.hex_count = attacker.hex_count
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        if is_landmark {
            attacker.landmark_count = attacker.landmark_count
                .checked_add(1)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
        }

        hex.owner = attacker.player;
        hex.last_owner_change = now;
        hex.last_combat_resolved = now;

        // Track peak hex count for attacker
        if attacker.hex_count > attacker.peak_hex_count {
            attacker.peak_hex_count = attacker.hex_count;
        }

        // Comeback burst check for defender
        if defender.hex_count < season.comeback_threshold
            && defender.peak_hex_count >= season.comeback_min_peak
            && !defender.comeback_used
        {
            let new_balance = (defender.energy_balance as u64)
                .checked_add(season.comeback_energy as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            defender.energy_balance = std::cmp::min(new_balance, season.energy_cap as u64) as u32;
            defender.comeback_used = true;
            emit!(ComebackBurst {
                season_id,
                player: defender.player,
                energy_granted: season.comeback_energy,
                hex_count: defender.hex_count,
                peak_hex_count: defender.peak_hex_count,
            });
        }

        // Stats
        attacker.attacks_won = attacker.attacks_won
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        defender.defences_made = defender.defences_made
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;

        // Capture bonus points
        attacker.points = attacker.points
            .checked_add(season.capture_bonus_points as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;

        // Landmark capture bonus
        if is_landmark {
            attacker.points = attacker.points
                .checked_add(season.landmark_capture_bonus_points as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            emit!(LandmarkCaptureBonus {
                season_id,
                player: attacker.player,
                hex_id,
                bonus_points: season.landmark_capture_bonus_points,
            });
        }

        // Theatre capture bonus
        if in_theatre {
            attacker.points = attacker.points
                .checked_add(season.theatre_capture_bonus_points as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            emit!(TheatreBonusAwarded {
                season_id,
                player: attacker.player,
                hex_id,
                bonus_type: 0, // capture
                points: season.theatre_capture_bonus_points,
            });
        }

        attack.result = AttackResult::AttackerWon;
        cooldown_end = now
            .checked_add(season.capture_cooldown_seconds)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
    } else {
        // ---- DEFENDER WINS (ties go to defender) ----
        outcome = 1; // DefenderWins

        // Hex remains with defender
        hex.last_combat_resolved = now;

        // Deduct defender's energy_committed by revealed amount (commitment consumed).
        // Use saturating_sub because claim_hex commitments are not tracked in energy_committed.
        defender.energy_committed = defender.energy_committed.saturating_sub(energy_amount);

        // Stats
        defender.defences_won = defender.defences_won
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        defender.defences_made = defender.defences_made
            .checked_add(1)
            .ok_or(SolvasionError::ArithmeticOverflow)?;

        // Defence win bonus points
        defender.points = defender.points
            .checked_add(season.defence_win_bonus_points as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;

        // Theatre defence bonus
        if in_theatre {
            defender.points = defender.points
                .checked_add(season.theatre_defence_bonus_points as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            emit!(TheatreBonusAwarded {
                season_id,
                player: defender.player,
                hex_id,
                bonus_type: 1, // defence
                points: season.theatre_defence_bonus_points,
            });
        }

        // Attack refund check
        let refund_threshold = (season.min_attack_energy as u64)
            .checked_mul(season.attack_refund_min_threshold_multiplier as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        if attacker_committed as u64 >= refund_threshold {
            let refund = (attacker_committed as u64)
                .checked_mul(season.attack_refund_bps as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?
                / 10_000;
            let new_atk_balance = (attacker.energy_balance as u64)
                .checked_add(refund)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            attacker.energy_balance = std::cmp::min(new_atk_balance, season.energy_cap as u64) as u32;
            attacker_refund = refund as u32;

            emit!(AttackRefunded {
                season_id,
                attack_id: attack.attack_id,
                player: attacker.player,
                refund_amount: attacker_refund,
            });
        }

        // Retaliation token
        if defender.has_retaliation_target
            && defender.retaliation_target == attacker.player
            && defender.has_retaliation_expires
            && defender.retaliation_expires > now
        {
            // Same attacker — extend expiry
            defender.retaliation_expires = now
                .checked_add(season.retaliation_window_seconds)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
        } else {
            // New or different attacker — replace
            defender.retaliation_target = attacker.player;
            defender.has_retaliation_target = true;
            defender.retaliation_expires = now
                .checked_add(season.retaliation_window_seconds)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            defender.has_retaliation_expires = true;
            defender.retaliation_discount_bps = season.retaliation_discount_bps;
        }
        emit!(RetaliationTokenGranted {
            season_id,
            player: defender.player,
            target: attacker.player,
            expires_at: defender.retaliation_expires,
            discount_bps: defender.retaliation_discount_bps,
        });

        attack.result = AttackResult::DefenderWon;
        cooldown_end = now
            .checked_add(season.defender_win_cooldown_seconds)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
    }

    // Step 5: Commitment consumed regardless of outcome
    hex.defence_commitment = [0u8; 32];
    hex.has_commitment = false;
    hex.defence_nonce = 0;

    // Step 6: Clear attack state on hex
    hex.under_attack = false;
    hex.commitment_locked = false;

    // Step 7: Mark resolved
    attack.resolved = true;

    // Save attack fields before closing the account
    let saved_attack_id = attack.attack_id;
    let saved_deadline = attack.deadline;

    // Step 8: Victory check
    if defender.points >= season.victory_threshold {
        emit!(VictoryThresholdReached {
            season_id,
            player: defender.player,
            score: defender.points,
        });
    }
    if attacker.points >= season.victory_threshold {
        emit!(VictoryThresholdReached {
            season_id,
            player: attacker.player,
            score: attacker.points,
        });
    }

    // Step 9: Clutch defence check (manual reveal only, defender wins only)
    if !guardian_reveal && outcome == 1 {
        let time_remaining = saved_deadline
            .checked_sub(now)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        if time_remaining <= season.clutch_window_seconds {
            defender.points = defender.points
                .checked_add(season.clutch_defence_bonus_points as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            defender.clutch_defences = defender.clutch_defences
                .checked_add(1)
                .ok_or(SolvasionError::ArithmeticOverflow)?;
            emit!(ClutchDefence {
                season_id,
                player: defender.player,
                hex_id,
                attack_id: saved_attack_id,
                bonus_points: season.clutch_defence_bonus_points,
            });
        }
    }

    // Step 10: Emit AttackResolved
    emit!(AttackResolved {
        season_id,
        attack_id: saved_attack_id,
        hex_id,
        attacker: attacker.player,
        defender: defender.player,
        attacker_committed,
        defender_revealed: energy_amount,
        outcome,
        attacker_surplus_returned,
        attacker_refund,
        cooldown_end,
        guardian_reveal,
    });

    // Step 11: Close Attack account (rent to attacker)
    let attack_account_info = ctx.accounts.attack.to_account_info();
    let rent_recipient = ctx.accounts.attacker_rent_recipient.to_account_info();
    let lamports = attack_account_info.lamports();
    **attack_account_info.try_borrow_mut_lamports()? = 0;
    **rent_recipient.try_borrow_mut_lamports()? = rent_recipient
        .lamports()
        .checked_add(lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut data = attack_account_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    Ok(())
}
