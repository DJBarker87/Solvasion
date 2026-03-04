use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, Season, AdjacencySet};
use crate::errors::SolvasionError;

#[derive(Accounts)]
#[instruction(chunk_index: u8, max_edge_count: u32)]
pub struct InitAdjacency<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [GlobalConfig::SEED],
        bump,
        has_one = admin @ SolvasionError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        seeds = [Season::SEED, season.season_id.to_le_bytes().as_ref()],
        bump,
        constraint = !season.map_finalized @ SolvasionError::MapAlreadyFinalized,
    )]
    pub season: Account<'info, Season>,

    #[account(
        init,
        payer = admin,
        space = AdjacencySet::space(max_edge_count),
        seeds = [
            AdjacencySet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[chunk_index],
        ],
        bump,
    )]
    pub adjacency_set: Account<'info, AdjacencySet>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitAdjacency>, chunk_index: u8, _max_edge_count: u32) -> Result<()> {
    let adj = &mut ctx.accounts.adjacency_set;
    adj.season_id = ctx.accounts.season.season_id;
    adj.chunk_index = chunk_index;
    adj.finalized = false;
    adj.edge_count = 0;
    adj.edges = Vec::new();
    Ok(())
}
