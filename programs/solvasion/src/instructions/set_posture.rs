use anchor_lang::prelude::*;
use crate::state::{Season, Player, Phase};
use crate::errors::SolvasionError;
use crate::helpers::effective_phase;
use crate::events::PostureSet;

#[derive(Accounts)]
pub struct SetPosture<'info> {
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
}

pub fn handler(
    ctx: Context<SetPosture>,
    posture_type: u8,
    posture_target: u64,
    posture_target_player: Option<Pubkey>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let season = &ctx.accounts.season;
    let phase = effective_phase(season, now);
    require!(phase != Phase::Ended, SolvasionError::SeasonEnded);

    // Validate posture type 0–3
    require!(posture_type <= 3, SolvasionError::InvalidPostureType);

    // Fortifying (1) and Mobilising (2) require a target hex/region
    if posture_type == 1 || posture_type == 2 {
        require!(posture_target != 0, SolvasionError::PostureRequiresTarget);
    }

    // StandingDown (3) requires a target player
    if posture_type == 3 {
        require!(
            posture_target_player.is_some(),
            SolvasionError::StandingDownRequiresPlayer
        );
    }

    let player = &mut ctx.accounts.player;
    player.posture_type = posture_type;
    player.posture_target = posture_target;

    match posture_target_player {
        Some(target) => {
            player.posture_target_player = target;
            player.has_posture_target_player = true;
        }
        None => {
            player.posture_target_player = Pubkey::default();
            player.has_posture_target_player = false;
        }
    }

    player.posture_expires = now
        .checked_add(86400)
        .ok_or(SolvasionError::ArithmeticOverflow)?;
    player.has_posture_expires = true;

    emit!(PostureSet {
        season_id: season.season_id,
        player: player.player,
        posture_type,
        target: posture_target,
        expires_at: player.posture_expires,
    });

    Ok(())
}
