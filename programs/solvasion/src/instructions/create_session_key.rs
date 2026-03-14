use anchor_lang::prelude::*;
use crate::state::{Season, Player, SessionKey, GlobalConfig};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;
use crate::state::Phase;

/// Player authorizes a temporary session key for hands-free gameplay.
/// The player wallet MUST sign this instruction (direct auth, not delegatable).
#[derive(Accounts)]
pub struct CreateSessionKey<'info> {
    /// The player's actual wallet — must sign to authorize delegation.
    #[account(mut)]
    pub player_wallet: Signer<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        seeds = [
            Player::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
        ],
        bump,
        constraint = player.player == player_wallet.key(),
    )]
    pub player: Account<'info, Player>,

    #[account(
        init_if_needed,
        payer = treasury,
        space = 8 + SessionKey::INIT_SPACE,
        seeds = [
            SessionKey::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
        ],
        bump,
    )]
    pub session_key_account: Account<'info, SessionKey>,

    /// CHECK: Treasury PDA pays rent
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateSessionKey>,
    session_pubkey: Pubkey,
    duration: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;

    // Season must be active
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Duration cap
    require!(duration > 0, SolvasionError::ArithmeticOverflow);
    require!(
        duration <= SessionKey::MAX_DURATION,
        SolvasionError::SessionKeyDurationExceeded
    );

    let expires_at = now
        .checked_add(duration)
        .ok_or(SolvasionError::ArithmeticOverflow)?;

    let sk = &mut ctx.accounts.session_key_account;
    sk.player = ctx.accounts.player_wallet.key();
    sk.session_key = session_pubkey;
    sk.season_id = season.season_id;
    sk.expires_at = expires_at;
    sk.created_at = now;

    Ok(())
}
