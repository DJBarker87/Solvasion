use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, Season, ValidHexSet};
use crate::errors::SolvasionError;

#[derive(Accounts)]
#[instruction(chunk_index: u8, max_hex_count: u32)]
pub struct InitValidHexes<'info> {
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
        space = ValidHexSet::space(max_hex_count),
        seeds = [
            ValidHexSet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[chunk_index],
        ],
        bump,
    )]
    pub valid_hex_set: Account<'info, ValidHexSet>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitValidHexes>, chunk_index: u8, _max_hex_count: u32) -> Result<()> {
    let vhs = &mut ctx.accounts.valid_hex_set;
    vhs.season_id = ctx.accounts.season.season_id;
    vhs.chunk_index = chunk_index;
    vhs.finalized = false;
    vhs.hex_count = 0;
    vhs.hex_ids = Vec::new();
    vhs.region_ids = Vec::new();
    Ok(())
}
