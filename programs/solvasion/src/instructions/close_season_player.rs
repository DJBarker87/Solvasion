use anchor_lang::prelude::*;
use crate::state::{Season, Player, GlobalConfig};
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

    /// CHECK: Treasury PDA receives rent from closed accounts
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,
}

pub fn handler(
    ctx: Context<CloseSeasonPlayer>,
) -> Result<()> {
    let season = &ctx.accounts.season;
    let player = &ctx.accounts.player;

    // Season must be ended and finalization complete
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);
    require!(season.finalization_complete, SolvasionError::FinalizationIncomplete);

    // Player must be finalized
    require!(player.finalized, SolvasionError::PlayerNotFinalized);

    let season_id = season.season_id;
    let rent_returned_to = ctx.accounts.treasury.key();

    // Close player account: drain lamports to treasury, zero data
    let player_info = ctx.accounts.player.to_account_info();
    let treasury_info = ctx.accounts.treasury.to_account_info();
    let lamports = player_info.lamports();
    **player_info.try_borrow_mut_lamports()? = 0;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut data = player_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    emit!(PlayerAccountClosed {
        season_id,
        player: player.player,
        rent_returned_to,
    });

    Ok(())
}
