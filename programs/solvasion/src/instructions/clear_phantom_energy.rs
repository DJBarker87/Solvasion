use anchor_lang::prelude::*;
use crate::state::{Season, Player};
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct ClearPhantomEnergy<'info> {
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
}

pub fn handler(ctx: Context<ClearPhantomEnergy>) -> Result<()> {
    let player = &mut ctx.accounts.player;

    // Fast-path: if player has no hexes but still has energy_committed, it's all phantom
    if player.hex_count == 0 && player.energy_committed > 0 {
        player.energy_committed = 0;
        player.phantom_energy = 0;
    }
    // No-op if hex_count > 0

    Ok(())
}
