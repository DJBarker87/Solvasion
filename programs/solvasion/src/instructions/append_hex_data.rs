use anchor_lang::prelude::*;
use crate::state::{GlobalConfig, Season, ValidHexSet};
use crate::errors::SolvasionError;

#[derive(Accounts)]
pub struct AppendHexData<'info> {
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
            ValidHexSet::SEED,
            season.season_id.to_le_bytes().as_ref(),
            &[valid_hex_set.chunk_index],
        ],
        bump,
        constraint = valid_hex_set.season_id == season.season_id,
    )]
    pub valid_hex_set: Account<'info, ValidHexSet>,
}

pub fn handler(
    ctx: Context<AppendHexData>,
    hex_ids: Vec<u64>,
    region_ids: Vec<u8>,
) -> Result<()> {
    require!(hex_ids.len() == region_ids.len(), SolvasionError::ArithmeticOverflow);

    let vhs = &mut ctx.accounts.valid_hex_set;
    vhs.hex_ids.extend_from_slice(&hex_ids);
    vhs.region_ids.extend_from_slice(&region_ids);
    vhs.hex_count = vhs.hex_ids.len() as u32;

    Ok(())
}
