use anchor_lang::prelude::*;
use crate::state::{Season, Player};
use crate::errors::SolvasionError;
use crate::events::PlayerAccountClosed;

#[derive(Accounts)]
pub struct CloseSeasonPlayer<'info> {
    pub any_signer: Signer<'info>,

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
            player.player.as_ref(),
        ],
        bump,
    )]
    pub player: Account<'info, Player>,
    // remaining_accounts[0]: rent recipient (must match player.player)
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, CloseSeasonPlayer<'info>>,
) -> Result<()> {
    let season = &ctx.accounts.season;
    let player = &ctx.accounts.player;

    // Season must be ended and finalization complete
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);
    require!(season.finalization_complete, SolvasionError::FinalizationIncomplete);

    // Player must be finalized
    require!(player.finalized, SolvasionError::PlayerNotFinalized);

    // Get rent recipient from remaining_accounts
    require!(ctx.remaining_accounts.len() >= 1, SolvasionError::Unauthorized);
    let recipient = &ctx.remaining_accounts[0];

    // Verify recipient matches player wallet
    require!(recipient.key() == player.player, SolvasionError::InvalidRecipient);

    let season_id = season.season_id;
    let rent_returned_to = player.player;

    // Close player account: drain lamports to recipient, zero data
    let player_info = ctx.accounts.player.to_account_info();
    let lamports = player_info.lamports();
    **player_info.try_borrow_mut_lamports()? = 0;
    **recipient.try_borrow_mut_lamports()? = recipient
        .lamports()
        .checked_add(lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut data = player_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    emit!(PlayerAccountClosed {
        season_id,
        player: rent_returned_to,
        rent_returned_to,
    });

    Ok(())
}
