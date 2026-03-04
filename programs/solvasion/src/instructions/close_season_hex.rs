use anchor_lang::prelude::*;
use crate::state::{Season, Hex};
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
    // remaining_accounts[0]: rent recipient (must match hex.owner)
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, CloseSeasonHex<'info>>,
    _hex_id: u64,
) -> Result<()> {
    let season = &ctx.accounts.season;
    let hex = &ctx.accounts.hex;

    // Season must be ended and finalization complete
    require!(season.has_actual_end, SolvasionError::SeasonNotEnded);
    require!(season.finalization_complete, SolvasionError::FinalizationIncomplete);

    // Get rent recipient from remaining_accounts
    require!(ctx.remaining_accounts.len() >= 1, SolvasionError::Unauthorized);
    let recipient = &ctx.remaining_accounts[0];

    // Verify recipient matches hex owner
    require!(recipient.key() == hex.owner, SolvasionError::InvalidRecipient);

    let hex_id = hex.hex_id;
    let season_id = season.season_id;
    let rent_returned_to = hex.owner;

    // Close hex account: drain lamports to recipient, zero data
    let hex_info = ctx.accounts.hex.to_account_info();
    let lamports = hex_info.lamports();
    **hex_info.try_borrow_mut_lamports()? = 0;
    **recipient.try_borrow_mut_lamports()? = recipient
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
