use anchor_lang::prelude::*;

pub mod crypto;
pub mod errors;
pub mod events;
pub mod helpers;
pub mod instructions;
pub mod state;

use instructions::initialize::*;
use instructions::create_season::*;
use instructions::init_valid_hexes::*;
use instructions::append_hex_data::*;
use instructions::init_adjacency::*;
use instructions::append_adjacency_data::*;
use instructions::finalize_map_data::*;
use instructions::join_season::*;
use instructions::claim_hex::*;
use instructions::set_banner::*;
use instructions::set_shield::*;
use instructions::set_posture::*;
use instructions::set_guardian::*;
use instructions::clear_guardian::*;
use instructions::commit_defence::*;
use instructions::increase_defence::*;
use instructions::withdraw_defence::*;
use instructions::recommit_defence::*;
use instructions::launch_attack::*;
use instructions::reveal_defence::*;
use instructions::resolve_timeout::*;
use instructions::end_season::*;
use instructions::claim_victory::*;
use instructions::finalize_chunk::*;
use instructions::finalize_complete::*;
use instructions::update_reputation::*;
use instructions::close_season_hex::*;
use instructions::close_season_player::*;
use instructions::recover_phantom_energy::*;
use instructions::clear_phantom_energy::*;
use instructions::set_active_theatres::*;
use instructions::batch_recover_phantom::*;
use instructions::batch_recommit_defence::*;
use instructions::propose_pact::*;
use instructions::accept_pact::*;

declare_id!("98VnxqEX7SBwLGJVAVeLSfQPEUDGwBEpQWwugvjPeAfM");

#[program]
pub mod solvasion {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn create_season(
        ctx: Context<CreateSeason>,
        params: CreateSeasonParams,
    ) -> Result<()> {
        instructions::create_season::handler(ctx, params)
    }

    pub fn init_valid_hexes(
        ctx: Context<InitValidHexes>,
        chunk_index: u8,
        max_hex_count: u32,
    ) -> Result<()> {
        instructions::init_valid_hexes::handler(ctx, chunk_index, max_hex_count)
    }

    pub fn append_hex_data(
        ctx: Context<AppendHexData>,
        hex_ids: Vec<u64>,
        region_ids: Vec<u8>,
    ) -> Result<()> {
        instructions::append_hex_data::handler(ctx, hex_ids, region_ids)
    }

    pub fn init_adjacency(
        ctx: Context<InitAdjacency>,
        chunk_index: u8,
        max_edge_count: u32,
    ) -> Result<()> {
        instructions::init_adjacency::handler(ctx, chunk_index, max_edge_count)
    }

    pub fn append_adjacency_data(
        ctx: Context<AppendAdjacencyData>,
        edges: Vec<[u64; 2]>,
    ) -> Result<()> {
        instructions::append_adjacency_data::handler(ctx, edges)
    }

    pub fn finalize_map_data(ctx: Context<FinalizeMapData>) -> Result<()> {
        instructions::finalize_map_data::handler(ctx)
    }

    pub fn join_season(ctx: Context<JoinSeason>) -> Result<()> {
        instructions::join_season::handler(ctx)
    }

    pub fn claim_hex(
        ctx: Context<ClaimHex>,
        hex_id: u64,
        initial_commitment: [u8; 32],
        initial_nonce: u64,
    ) -> Result<()> {
        instructions::claim_hex::handler(ctx, hex_id, initial_commitment, initial_nonce)
    }

    pub fn set_banner(ctx: Context<SetBanner>) -> Result<()> {
        instructions::set_banner::handler(ctx)
    }

    pub fn set_shield(ctx: Context<SetShield>, shield_start_hour: u8) -> Result<()> {
        instructions::set_shield::handler(ctx, shield_start_hour)
    }

    pub fn set_posture(
        ctx: Context<SetPosture>,
        posture_type: u8,
        posture_target: u64,
        posture_target_player: Option<Pubkey>,
    ) -> Result<()> {
        instructions::set_posture::handler(ctx, posture_type, posture_target, posture_target_player)
    }

    pub fn set_guardian(ctx: Context<SetGuardian>, guardian_pubkey: Pubkey) -> Result<()> {
        instructions::set_guardian::handler(ctx, guardian_pubkey)
    }

    pub fn clear_guardian(ctx: Context<ClearGuardian>) -> Result<()> {
        instructions::clear_guardian::handler(ctx)
    }

    pub fn commit_defence(
        ctx: Context<CommitDefence>,
        commitments: Vec<CommitmentEntry>,
        total_energy_delta: u32,
    ) -> Result<()> {
        instructions::commit_defence::handler(ctx, commitments, total_energy_delta)
    }

    pub fn increase_defence(
        ctx: Context<IncreaseDefence>,
        hex_id: u64,
        new_commitment: [u8; 32],
        new_nonce: u64,
        delta: u32,
    ) -> Result<()> {
        instructions::increase_defence::handler(ctx, hex_id, new_commitment, new_nonce, delta)
    }

    pub fn withdraw_defence(
        ctx: Context<WithdrawDefence>,
        hex_id: u64,
        energy_amount: u32,
        blind: [u8; 32],
    ) -> Result<()> {
        instructions::withdraw_defence::handler(ctx, hex_id, energy_amount, blind)
    }

    pub fn recommit_defence(
        ctx: Context<RecommitDefence>,
        hex_id: u64,
        old_energy_amount: u32,
        old_blind: [u8; 32],
        new_commitment: [u8; 32],
        new_nonce: u64,
        new_energy_delta: u32,
    ) -> Result<()> {
        instructions::recommit_defence::handler(
            ctx, hex_id, old_energy_amount, old_blind,
            new_commitment, new_nonce, new_energy_delta,
        )
    }

    pub fn launch_attack<'info>(
        ctx: Context<'_, '_, 'info, 'info, LaunchAttack<'info>>,
        target_hex_id: u64,
        origin_hex_id: u64,
        energy_committed: u32,
        adjacency_chunk_index: u8,
    ) -> Result<()> {
        instructions::launch_attack::handler(
            ctx, target_hex_id, origin_hex_id, energy_committed, adjacency_chunk_index,
        )
    }

    pub fn reveal_defence(
        ctx: Context<RevealDefence>,
        attack_id: u64,
        energy_amount: u32,
        blind: [u8; 32],
    ) -> Result<()> {
        instructions::reveal_defence::handler(ctx, attack_id, energy_amount, blind)
    }

    pub fn resolve_timeout(
        ctx: Context<ResolveTimeout>,
        attack_id: u64,
    ) -> Result<()> {
        instructions::resolve_timeout::handler(ctx, attack_id)
    }

    pub fn end_season(ctx: Context<EndSeason>) -> Result<()> {
        instructions::end_season::handler(ctx)
    }

    pub fn claim_victory(ctx: Context<ClaimVictory>) -> Result<()> {
        instructions::claim_victory::handler(ctx)
    }

    pub fn finalize_chunk<'info>(ctx: Context<'_, '_, 'info, 'info, FinalizeChunk<'info>>) -> Result<()> {
        instructions::finalize_chunk::handler(ctx)
    }

    pub fn finalize_complete(ctx: Context<FinalizeComplete>) -> Result<()> {
        instructions::finalize_complete::handler(ctx)
    }

    pub fn update_reputation(ctx: Context<UpdateReputation>) -> Result<()> {
        instructions::update_reputation::handler(ctx)
    }

    pub fn close_season_hex<'info>(ctx: Context<'_, '_, 'info, 'info, CloseSeasonHex<'info>>, hex_id: u64) -> Result<()> {
        instructions::close_season_hex::handler(ctx, hex_id)
    }

    pub fn close_season_player<'info>(ctx: Context<'_, '_, 'info, 'info, CloseSeasonPlayer<'info>>) -> Result<()> {
        instructions::close_season_player::handler(ctx)
    }

    pub fn recover_phantom_energy(ctx: Context<RecoverPhantomEnergy>, hex_id: u64) -> Result<()> {
        instructions::recover_phantom_energy::handler(ctx, hex_id)
    }

    pub fn clear_phantom_energy(ctx: Context<ClearPhantomEnergy>) -> Result<()> {
        instructions::clear_phantom_energy::handler(ctx)
    }

    pub fn set_active_theatres(
        ctx: Context<SetActiveTheatres>,
        theatre_regions: [u8; 3],
        expires_at: i64,
    ) -> Result<()> {
        instructions::set_active_theatres::handler(ctx, theatre_regions, expires_at)
    }

    pub fn batch_recover_phantom<'info>(
        ctx: Context<'_, '_, 'info, 'info, BatchRecoverPhantom<'info>>,
    ) -> Result<()> {
        instructions::batch_recover_phantom::handler(ctx)
    }

    pub fn batch_recommit_defence<'info>(
        ctx: Context<'_, '_, 'info, 'info, BatchRecommitDefence<'info>>,
        entries: Vec<RecommitEntry>,
    ) -> Result<()> {
        instructions::batch_recommit_defence::handler(ctx, entries)
    }

    pub fn propose_pact(ctx: Context<ProposePact>, duration: i64, sorted_a: Pubkey, sorted_b: Pubkey) -> Result<()> {
        instructions::propose_pact::handler(ctx, duration, sorted_a, sorted_b)
    }

    pub fn accept_pact(ctx: Context<AcceptPact>) -> Result<()> {
        instructions::accept_pact::handler(ctx)
    }
}
