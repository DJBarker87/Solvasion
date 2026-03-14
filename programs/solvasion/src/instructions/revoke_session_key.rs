use anchor_lang::prelude::*;
use crate::state::{Season, Player, SessionKey, GlobalConfig};
use crate::errors::SolvasionError;

/// Player revokes their session key early. Closes the account, rent to treasury.
/// Player wallet MUST sign (not delegatable — you can't use a session key to revoke itself).
#[derive(Accounts)]
pub struct RevokeSessionKey<'info> {
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
        mut,
        seeds = [
            SessionKey::SEED,
            season.season_id.to_le_bytes().as_ref(),
            player_wallet.key().as_ref(),
        ],
        bump,
        constraint = session_key_account.player == player_wallet.key(),
    )]
    pub session_key_account: Account<'info, SessionKey>,

    /// CHECK: Treasury PDA receives rent
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,
}

pub fn handler(ctx: Context<RevokeSessionKey>) -> Result<()> {
    // Close session key account: rent to treasury
    let sk_info = ctx.accounts.session_key_account.to_account_info();
    let treasury_info = ctx.accounts.treasury.to_account_info();
    let lamports = sk_info.lamports();
    **sk_info.try_borrow_mut_lamports()? = 0;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut data = sk_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    Ok(())
}
