use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, Season, AdjacencySet, Edge};
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct AppendAdjacencyData<'info> {
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
        mut,
        seeds = [
            AdjacencySet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[adjacency_set.chunk_index],
        ],
        bump,
        constraint = adjacency_set.season_id == season.season_id,
    )]
    pub adjacency_set: Account<'info, AdjacencySet>,
}

pub fn handler(
    ctx: Context<AppendAdjacencyData>,
    edges: Vec<[u64; 2]>,
) -> Result<()> {
    let adj = &mut ctx.accounts.adjacency_set;

    for pair in &edges {
        let (a, b) = if pair[0] < pair[1] {
            (pair[0], pair[1])
        } else {
            (pair[1], pair[0])
        };
        adj.edges.push(Edge { hex_a: a, hex_b: b });
    }

    adj.edge_count = adj.edges.len() as u32;

    Ok(())
}
