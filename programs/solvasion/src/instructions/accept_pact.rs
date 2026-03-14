use anchor_lang::prelude::*;
use crate::state::{Season, Player, Pact};
use crate::errors::SolvasionError;
use crate::events::PactAccepted;

#[derive(Accounts)]
pub struct AcceptPact<'info> {
    pub authority: Signer<'info>,

    /// CHECK: Acceptor wallet for PDA derivation. Verified by authority check in handler.
    pub acceptor: UncheckedAccount<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            acceptor.key().as_ref(),
        ],
        bump,
    )]
    pub player: Account<'info, Player>,

    #[account(
        mut,
        seeds = [
            Pact::SEED,
            season.season_id.to_le_bytes().as_ref(),
            pact.player_a.as_ref(),
            pact.player_b.as_ref(),
        ],
        bump,
        constraint = !pact.accepted @ SolvasionError::PactAlreadyAccepted,
        constraint = !pact.broken @ SolvasionError::PactBroken,
    )]
    pub pact: Account<'info, Pact>,
}

pub fn handler(ctx: Context<AcceptPact>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let pact = &mut ctx.accounts.pact;
    let acceptor = ctx.accounts.acceptor.key();

    crate::helpers::verify_player_authority(
        &ctx.accounts.authority.key(),
        &ctx.accounts.player,
        ctx.remaining_accounts,
        ctx.program_id,
        season.season_id,
        now,
    )?;

    // Verify the acceptor is the other party (not the proposer)
    require!(
        acceptor == pact.player_a || acceptor == pact.player_b,
        SolvasionError::Unauthorized
    );

    // Proposer cannot accept their own pact
    require!(acceptor != pact.proposed_by, SolvasionError::ProposerCannotAccept);

    // Verify not expired
    require!(now < pact.expires_at, SolvasionError::DeadlinePassed);

    pact.accepted = true;

    emit!(PactAccepted {
        season_id: pact.season_id,
        player_a: pact.player_a,
        player_b: pact.player_b,
        expires_at: pact.expires_at,
    });

    Ok(())
}
