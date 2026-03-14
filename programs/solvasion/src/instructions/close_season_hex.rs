use anchor_lang::prelude::*;
use crate::state::{Season, Hex, GlobalConfig};
use crate::errors::SolvasionError;
use crate::events::HexAccountClosed;

#[derive(Accounts)]
#[instruction(hex_id: u64)]
pub struct CloseSeasonHex<'info> {
    pub any_signer: Signer<'info>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub season: Account<'info, Season>,

    #[account(
        mut,
        seeds = [
            Hex::SEED,
            season.season_id.to_le_bytes().as_ref(),
            hex_id.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub hex: Account<'info, Hex>,

    /// CHECK: Treasury PDA receives rent from closed accounts
    #[account(
        mut,
        seeds = [GlobalConfig::TREASURY_SEED],
        bump,
    )]
    pub treasury: SystemAccount<'info>,
}

pub fn handler(
    ctx: Context<CloseSeasonHex>,
    _hex_id: u64,
) -> Result<()> {
    let season = &ctx.accounts.season;
    let hex = &ctx.accounts.hex;

    // Season must be ended and finalization complete
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);
    require!(season.finalization_complete, SolvasionError::FinalizationIncomplete);

    let hex_id = hex.hex_id;
    let season_id = season.season_id;
    let rent_returned_to = ctx.accounts.treasury.key();

    // Close hex account: drain lamports to treasury, zero data
    let hex_info = ctx.accounts.hex.to_account_info();
    let treasury_info = ctx.accounts.treasury.to_account_info();
    let lamports = hex_info.lamports();
    **hex_info.try_borrow_mut_lamports()? = 0;
    **treasury_info.try_borrow_mut_lamports()? = treasury_info
        .lamports()
        .checked_add(lamports)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    let mut data = hex_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    emit!(HexAccountClosed {
        season_id,
        hex_id,
        rent_returned_to,
    });

    Ok(())
}
