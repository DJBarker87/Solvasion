use anchor_lang::prelude::*;
use crate::state::{Season, Player, Hex, Attack, AttackResult, PhantomRecovery};
use crate::errors::SolvasionError;
use crate::helpers::recalculate_points;
use crate::events::{AttackResolved, TheatreBonusAwarded, VictoryThresholdReached};

#[derive(Accounts)]
#[instruction(attack_id: u64)]
pub struct ResolveTimeout<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

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

    #[account(
        init,
        payer = payer,
        space = 8 + PhantomRecovery::INIT_SPACE,
        seeds = [
            PhantomRecovery::SEED,
            season.season_id.to_le_bytes().as_ref(),
            attack.defender.as_ref(),
            attack.target_hex.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub phantom_recovery: Account<'info, PhantomRecovery>,

    /// CHECK: Receives rent from closed attack account. Must match attack.attacker.
    #[account(
        mut,
        constraint = attacker_rent_recipient.key() == attack.attacker @ SolvasionError::InvalidRecipient,
    )]
    pub attacker_rent_recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ResolveTimeout>,
    _attack_id: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let defender = &mut ctx.accounts.player_defender;
    let attacker = &mut ctx.accounts.player_attacker;
    let hex = &mut ctx.accounts.hex;
    let attack = &mut ctx.accounts.attack;

    // Verify deadline has passed
    require!(now > attack.deadline, SolvasionError::DeadlineNotPassed);

    // Recalculate points for both players
    recalculate_points(defender, season, now)?;
    recalculate_points(attacker, season, now)?;

    let hex_id = hex.hex_id;
    let season_id = season.season_id;
    let attacker_committed = attack.energy_committed;

    // Attacker wins by default
    // Energy returned = max(0, committed - min_attack_energy)
    let energy_returned = attacker_committed.saturating_sub(season.min_attack_energy);
    let new_atk_balance = (attacker.energy_balance as u64)
        .checked_add(energy_returned as u64)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    attacker.energy_balance = std::cmp::min(new_atk_balance, season.energy_cap as u64) as u32;

    // Defender's energy_committed is NOT reduced (phantom energy)
    defender.phantom_energy = defender.phantom_energy
        .checked_add(season.phantom_recovery_energy)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Create PhantomRecovery account
    let phantom = &mut ctx.accounts.phantom_recovery;
    phantom.season_id = season_id;
    phantom.player = defender.player;
    phantom.hex_id = hex_id;
    phantom.recovery_amount = season.phantom_recovery_energy;
    phantom.lost_at = now;
    phantom.recovered = false;

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

    // Stats
    attacker.attacks_won = attacker.attacks_won
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Theatre bonus for attacker
    let in_theatre = season.active_theatres.iter().any(|&r| r != 0 && r == hex.region_id)
        && now < season.theatre_expires_at;
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

    // Mark resolved
    attack.resolved = true;
    attack.result = AttackResult::DefaultWin;

    // Save attack fields before closing
    let saved_attack_id = attack.attack_id;

    // Clear hex combat state and commitment
    hex.under_attack = false;
    hex.commitment_locked = false;
    hex.defence_commitment = [0u8; 32];
    hex.has_commitment = false;
    hex.defence_nonce = 0;

    // Victory check
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

    // Cooldown end for event
    let cooldown_end = now
        .checked_add(season.capture_cooldown_seconds)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    emit!(AttackResolved {
        season_id,
        attack_id: saved_attack_id,
        hex_id,
        attacker: attacker.player,
        defender: defender.player,
        attacker_committed,
        defender_revealed: 0,
        outcome: 2, // Timeout
        attacker_surplus_returned: energy_returned,
        attacker_refund: 0,
        cooldown_end,
        guardian_reveal: false,
    });

    // Close Attack account (rent to attacker)
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
