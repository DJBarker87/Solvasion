use anchor_lang::prelude::*;
use crate::state::{Season, Player, Phase};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;

#[derive(Accounts)]
pub struct SetBanner<'info> {
    pub player_wallet: Signer<'info>,

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
            player_wallet.key().as_ref(),
        ],
        bump,
        constraint = player.player == player_wallet.key(),
    )]
    pub player: Account<'info, Player>,

    /// The NFT mint account.
    /// CHECK: We only need the pubkey; ownership verified via token account.
    pub nft_mint: UncheckedAccount<'info>,

    /// The player's token account holding the NFT.
    /// CHECK: Manually deserialized to avoid anchor-spl dependency.
    pub nft_token_account: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<SetBanner>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Read raw SPL token account data:
    // - owner at offset 32 (32 bytes)
    // - amount at offset 64 (8 bytes LE)
    let token_data = ctx.accounts.nft_token_account.try_borrow_data()?;
    require!(token_data.len() >= 72, SolvasionError::NftNotOwned);

    // Verify token account owner matches player wallet
    let token_owner = Pubkey::try_from(&token_data[32..64])
        .map_err(|_| SolvasionError::NftNotOwned)?;
    require!(token_owner == ctx.accounts.player_wallet.key(), SolvasionError::NftNotOwned);

    // Verify token account mint matches provided mint
    let token_mint = Pubkey::try_from(&token_data[0..32])
        .map_err(|_| SolvasionError::NftNotOwned)?;
    require!(token_mint == ctx.accounts.nft_mint.key(), SolvasionError::NftNotOwned);

    // Verify balance >= 1
    let amount = u64::from_le_bytes(
        token_data[64..72].try_into().unwrap()
    );
    require!(amount >= 1, SolvasionError::NftNotOwned);

    let player = &mut ctx.accounts.player;
    player.banner_nft = ctx.accounts.nft_mint.key();
    player.has_banner_nft = true;

    Ok(())
}
