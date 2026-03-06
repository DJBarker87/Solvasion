use anchor_lang::prelude::*;
use crate::state::{Season, Player, Pact};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;
use crate::events::PactProposed;

#[derive(Accounts)]
#[instruction(duration: i64, sorted_a: Pubkey, sorted_b: Pubkey)]
pub struct ProposePact<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            proposer.key().as_ref(),
        ],
        bump,
    )]
    pub player_proposer: Account<'info, Player>,

    /// CHECK: target player account — validated by Player PDA seeds
    #[account(
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            target.key().as_ref(),
        ],
        bump,
    )]
    pub player_target: Account<'info, Player>,

    /// CHECK: target pubkey
    pub target: UncheckedAccount<'info>,

    #[account(
        init,
        payer = proposer,
        space = 8 + Pact::INIT_SPACE,
        seeds = [
            Pact::SEED,
            season.season_id.to_le_bytes().as_ref(),
            sorted_a.as_ref(),
            sorted_b.as_ref(),
        ],
        bump,
    )]
    pub pact: Account<'info, Pact>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ProposePact>, duration: i64, sorted_a: Pubkey, sorted_b: Pubkey) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let proposer_key = ctx.accounts.proposer.key();
    let target_key = ctx.accounts.target.key();

    // Validate sorted keys match proposer + target
    let expected_a = if proposer_key < target_key { proposer_key } else { target_key };
    let expected_b = if proposer_key < target_key { target_key } else { proposer_key };
    require!(sorted_a == expected_a && sorted_b == expected_b, SolvasionError::Unauthorized);

    let phase = effective_phase(season, now);
    require!(phase != crate::state::Phase::Ended, SolvasionError::SeasonEnded);

    // Max pact duration
    require!(duration > 0 && duration <= season.pact_max_duration, SolvasionError::ArithmeticOverflow);

    let expires_at = now.checked_add(duration).ok_or(SolvasionError::ArithmeticOverflow)?;

    let pact = &mut ctx.accounts.pact;
    pact.season_id = season.season_id;
    pact.player_a = sorted_a;
    pact.player_b = sorted_b;
    pact.expires_at = expires_at;
    pact.broken = false;
    pact.broken_by = Pubkey::default();
    pact.accepted = false;

    emit!(PactProposed {
        season_id: season.season_id,
        proposer: proposer_key,
        target: target_key,
        expires_at,
    });

    Ok(())
}
