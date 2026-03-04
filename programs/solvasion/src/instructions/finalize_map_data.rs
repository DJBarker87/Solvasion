use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, Season, ValidHexSet, AdjacencySet};
use crate::errors::SolvasionError;
use crate::events::MapFinalized;

#[derive(Accounts)]
pub struct FinalizeMapData<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
        constraint = !season.map_finalized @ SolvasionError::MapAlreadyFinalized,
    )]
    pub season: Account<'info, Season>,

    /// The primary ValidHexSet chunk (chunk 0). Must have data.
    #[account(
        seeds = [
            ValidHexSet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[0u8],
        ],
        bump,
        constraint = valid_hex_set.hex_count > 0 @ SolvasionError::MapNotFinalized,
    )]
    pub valid_hex_set: Account<'info, ValidHexSet>,

    /// The primary AdjacencySet chunk (chunk 0). Must have data.
    #[account(
        seeds = [
            AdjacencySet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[0u8],
        ],
        bump,
        constraint = adjacency_set.edge_count > 0 @ SolvasionError::MapNotFinalized,
    )]
    pub adjacency_set: Account<'info, AdjacencySet>,
}

pub fn handler(ctx: Context<FinalizeMapData>) -> Result<()> {
    let season = &mut ctx.accounts.season;
    season.map_finalized = true;

    emit!(MapFinalized {
        season_id: season.season_id,
        hex_count: ctx.accounts.valid_hex_set.hex_count,
        edge_count: ctx.accounts.adjacency_set.edge_count,
    });

    Ok(())
}
