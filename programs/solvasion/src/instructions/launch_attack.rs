use anchor_lang::prelude::*;
use crate::state::{Season, SeasonCounters, Player, Hex, AdjacencySet, Attack, AttackResult, Phase, Pact};
use crate::errors::SolvasionError;
use crate::helpers::{effective_phase, recalculate_energy, apply_pending_shield, is_in_shield_window, recalculate_points};
use crate::events::{AttackLaunched, RetaliationTokenUsed, PactBroken};

#[derive(Accounts)]
#[instruction(target_hex_id: u64, origin_hex_id: u64, energy_committed: u32, adjacency_chunk_index: u8)]
pub struct LaunchAttack<'info> {
    #[account(mut)]
    pub player_wallet: Signer<'info>,

    #[account(
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

    #[account(
        mut,
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
        ],
        bump,
        constraint = player_attacker.player == player_wallet.key(),
    )]
    pub player_attacker: Account<'info, Player>,

    #[account(
        mut,
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            hex_target.owner.as_ref(),
        ],
        bump,
    )]
    pub player_defender: Account<'info, Player>,

    #[account(
        mut,
        seeds = [
            Hex::SEED,
            season.season_id.to_le_bytes().as_ref(),
            target_hex_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub hex_target: Account<'info, Hex>,

    #[account(
        seeds = [
            Hex::SEED,
            season.season_id.to_le_bytes().as_ref(),
            origin_hex_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub hex_origin: Account<'info, Hex>,

    #[account(
        seeds = [
            AdjacencySet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[adjacency_chunk_index],
        ],
        bump,
        constraint = adjacency_set.season_id == season.season_id,
    )]
    pub adjacency_set: Account<'info, AdjacencySet>,

    #[account(
        init,
        payer = player_wallet,
        space = 8 + Attack::INIT_SPACE,
        seeds = [
            Attack::SEED,
            season.season_id.to_le_bytes().as_ref(),
            season_counters.next_attack_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub attack: Account<'info, Attack>,

    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, LaunchAttack<'info>>,
    target_hex_id: u64,
    origin_hex_id: u64,
    energy_committed: u32,
    _adjacency_chunk_index: u8,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let attacker = &mut ctx.accounts.player_attacker;
    let defender = &mut ctx.accounts.player_defender;
    let hex_target = &mut ctx.accounts.hex_target;
    let hex_origin = &ctx.accounts.hex_origin;

    // Phase check — must be War or Escalation
    let phase = effective_phase(season, now);
    require!(
        phase == Phase::War || phase == Phase::EscalationStage1 || phase == Phase::EscalationStage2,
        SolvasionError::AttackDuringLandRush
    );

    // Recalculate attacker energy
    recalculate_energy(attacker, season, now)?;

    // Determine effective min_attack_energy (may be discounted by retaliation token)
    let mut effective_min_attack = season.min_attack_energy;
    let mut retaliation_used = false;
    let mut retaliation_discount: u16 = 0;

    if attacker.has_retaliation_target
        && attacker.retaliation_target == hex_target.owner
        && attacker.has_retaliation_expires
        && attacker.retaliation_expires > now
    {
        // Apply retaliation discount
        retaliation_discount = attacker.retaliation_discount_bps;
        let discount = (effective_min_attack as u64)
            .checked_mul(retaliation_discount as u64)
            .ok_or(SolvasionError::ArithmeticOverflow)?
            / 10_000;
        effective_min_attack = effective_min_attack
            .checked_sub(discount as u32)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        retaliation_used = true;
    }

    // Apply escalation multiplier to min_attack_energy
    match phase {
        Phase::EscalationStage1 => {
            effective_min_attack = (effective_min_attack as u64)
                .checked_mul(season.escalation_attack_cost_multiplier_bps as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?
                .checked_div(10_000)
                .ok_or(SolvasionError::ArithmeticOverflow)? as u32;
        }
        Phase::EscalationStage2 => {
            effective_min_attack = (effective_min_attack as u64)
                .checked_mul(season.escalation_stage_2_attack_cost_multiplier_bps as u64)
                .ok_or(SolvasionError::ArithmeticOverflow)?
                .checked_div(10_000)
                .ok_or(SolvasionError::ArithmeticOverflow)? as u32;
        }
        _ => {}
    }

    require!(energy_committed >= effective_min_attack, SolvasionError::BelowMinAttackEnergy);
    require!(attacker.energy_balance >= energy_committed, SolvasionError::InsufficientEnergy);

    // Verify attacker owns origin hex
    require!(hex_origin.owner == attacker.player, SolvasionError::NotHexOwner);

    // Cannot attack own hex
    require!(hex_target.owner != attacker.player, SolvasionError::SelfAttack);

    // Verify adjacency
    require!(
        ctx.accounts.adjacency_set.find_edge(target_hex_id, origin_hex_id),
        SolvasionError::NotAdjacent
    );

    // Verify hex not already under attack
    require!(!hex_target.under_attack, SolvasionError::HexUnderAttack);

    // Occupation shield check
    let time_since_ownership = now
        .checked_sub(hex_target.last_owner_change)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    require!(
        time_since_ownership > season.occupation_shield_seconds,
        SolvasionError::OccupationShieldActive
    );

    // Combat cooldown check
    if hex_target.last_combat_resolved > 0 {
        let time_since_combat = now
            .checked_sub(hex_target.last_combat_resolved)
            .ok_or(SolvasionError::ArithmeticOverflow)?;
        let applicable_cooldown = if hex_target.last_owner_change == hex_target.last_combat_resolved {
            // Ownership changed at last combat resolution → capture cooldown
            season.capture_cooldown_seconds
        } else {
            // Defender won last combat → defender win cooldown
            season.defender_win_cooldown_seconds
        };
        require!(
            time_since_combat > applicable_cooldown,
            SolvasionError::CombatCooldownActive
        );
    }

    // Deduct energy
    attacker.energy_balance = attacker.energy_balance
        .checked_sub(energy_committed)
        .ok_or(SolvasionError::InsufficientEnergy)?;

    // Generate attack_id
    let counters = &mut ctx.accounts.season_counters;
    let attack_id = counters.next_attack_id;
    counters.next_attack_id = counters.next_attack_id
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Calculate deadline based on defender's shield window
    apply_pending_shield(defender, now);
    let in_shield = is_in_shield_window(defender.shield_start_hour, now);
    let deadline = if in_shield {
        now.checked_add(season.extended_attack_window)
            .ok_or(SolvasionError::ArithmeticOverflow)?
    } else {
        now.checked_add(season.base_attack_window)
            .ok_or(SolvasionError::ArithmeticOverflow)?
    };

    // Create Attack account
    let attack = &mut ctx.accounts.attack;
    attack.attack_id = attack_id;
    attack.season_id = season.season_id;
    attack.attacker = attacker.player;
    attack.target_hex = target_hex_id;
    attack.origin_hex = origin_hex_id;
    attack.energy_committed = energy_committed;
    attack.defender = hex_target.owner;
    attack.launched_at = now;
    attack.deadline = deadline;
    attack.resolved = false;
    attack.result = AttackResult::Pending;

    // Lock the hex
    hex_target.under_attack = true;
    hex_target.commitment_locked = true;

    // Update attacker stats
    attacker.attacks_launched = attacker.attacks_launched
        .checked_add(1)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    // Pact-break check: scan remaining_accounts for an active Pact between attacker and defender
    for account_info in ctx.remaining_accounts.iter() {
        if let Ok(pact) = Account::<Pact>::try_from(account_info) {
            let attacker_key = attacker.player;
            let defender_key = hex_target.owner;
            let sorted_a = if attacker_key < defender_key { attacker_key } else { defender_key };
            let sorted_b = if attacker_key < defender_key { defender_key } else { attacker_key };

            if pact.season_id == season.season_id
                && pact.player_a == sorted_a
                && pact.player_b == sorted_b
                && pact.accepted
                && !pact.broken
                && now < pact.expires_at
            {
                // Pact exists and is active — deduct penalty points from attacker
                recalculate_points(attacker, season, now)?;
                attacker.points = attacker.points.saturating_sub(season.pact_break_penalty_points as u64);

                // Mark pact as broken (need mutable access)
                let mut pact_data = account_info.try_borrow_mut_data()?;
                // broken field is at offset: 8 (discriminator) + 8 (season_id) + 32 (player_a) + 32 (player_b) + 8 (expires_at) = 88
                pact_data[88] = 1; // broken = true
                // broken_by starts at offset 89 (32 bytes)
                pact_data[89..121].copy_from_slice(&attacker_key.to_bytes());

                emit!(PactBroken {
                    season_id: season.season_id,
                    broken_by: attacker_key,
                    victim: defender_key,
                    penalty_points: season.pact_break_penalty_points,
                });
                break;
            }
        }
    }

    // Consume retaliation token if used
    if retaliation_used {
        emit!(RetaliationTokenUsed {
            season_id: season.season_id,
            player: attacker.player,
            target: hex_target.owner,
            attack_id,
            discount_applied: retaliation_discount,
        });
        attacker.has_retaliation_target = false;
        attacker.retaliation_target = Pubkey::default();
        attacker.has_retaliation_expires = false;
        attacker.retaliation_expires = 0;
        attacker.retaliation_discount_bps = 0;
    }

    emit!(AttackLaunched {
        season_id: season.season_id,
        attack_id,
        attacker: attacker.player,
        defender: hex_target.owner,
        target_hex: target_hex_id,
        energy: energy_committed,
        deadline,
    });

    Ok(())
}
