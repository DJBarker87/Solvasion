use anchor_lang::prelude::*;

#[error_code]
pub enum SolvasionError {
    #[msg("Program is paused")]
    ProgramPaused,
    #[msg("Season has ended")]
    SeasonEnded,
    #[msg("Map data has not been finalized")]
    MapNotFinalized,
    #[msg("Join cutoff has passed")]
    JoinCutoffPassed,
    #[msg("Player has already joined this season")]
    AlreadyJoined,
    #[msg("Insufficient energy")]
    InsufficientEnergy,
    #[msg("Hex is not in the valid hex set")]
    InvalidHex,
    #[msg("Hex is already owned")]
    HexAlreadyOwned,
    #[msg("Hexes are not adjacent")]
    NotAdjacent,
    #[msg("Edge not found in the provided adjacency chunk")]
    EdgeNotInChunk,
    #[msg("Respawn limit exceeded")]
    RespawnLimitExceeded,
    #[msg("Caller does not own this hex")]
    NotHexOwner,
    #[msg("Commitment is locked due to active attack")]
    CommitmentLocked,
    #[msg("Hex already has a defence commitment")]
    CommitmentExists,
    #[msg("Hex has no defence commitment")]
    NoCommitment,
    #[msg("Nonce does not match expected commitment_nonce")]
    InvalidNonce,
    #[msg("Pedersen commitment opening verification failed")]
    InvalidCommitmentOpening,
    #[msg("Attacking is not permitted during Land Rush")]
    AttackDuringLandRush,
    #[msg("Hex already has a pending attack")]
    HexUnderAttack,
    #[msg("Hex is within occupation shield window")]
    OccupationShieldActive,
    #[msg("Hex is within combat cooldown window")]
    CombatCooldownActive,
    #[msg("Cannot attack your own hex")]
    SelfAttack,
    #[msg("Energy committed is below minimum attack energy")]
    BelowMinAttackEnergy,
    #[msg("Attack has already been resolved")]
    AttackAlreadyResolved,
    #[msg("Deadline has not passed yet")]
    DeadlineNotPassed,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Caller is not the defender")]
    NotDefender,
    #[msg("Season has not ended yet")]
    SeasonNotEnded,
    #[msg("Finalization is already complete")]
    FinalizationComplete,
    #[msg("Finalization is not yet complete")]
    FinalizationIncomplete,
    #[msg("Player has not been finalized")]
    PlayerNotFinalized,
    #[msg("Recipient wallet does not match stored owner")]
    InvalidRecipient,
    #[msg("Player's points are below the victory threshold")]
    VictoryNotReached,
    #[msg("Shield hour must be 0–23")]
    InvalidShieldHour,
    #[msg("Wallet does not hold the specified NFT")]
    NftNotOwned,
    #[msg("Map data has already been finalized")]
    MapAlreadyFinalized,
    #[msg("Recovery cannot be claimed within 24 hours of timeout")]
    RecoveryTooEarly,
    #[msg("Recovery has already been claimed for this hex")]
    RecoveryAlreadyClaimed,
    #[msg("No initial commitment provided")]
    MissingInitialCommitment,
    #[msg("Initial nonce does not match player.commitment_nonce")]
    InitialNonceMismatch,
    #[msg("Invalid region ID")]
    InvalidRegionId,
    #[msg("Season is not in a combat phase")]
    SeasonNotInCombatPhase,
    #[msg("Retaliation token target does not match hex owner")]
    RetaliationTargetMismatch,
    #[msg("Invalid posture type")]
    InvalidPostureType,
    #[msg("Posture requires a target")]
    PostureRequiresTarget,
    #[msg("Standing Down requires a target player")]
    StandingDownRequiresPlayer,
    #[msg("Theatre window exceeds 49-hour maximum")]
    TheatreWindowTooLong,
    #[msg("Theatre window is not in the future")]
    TheatreWindowTooShort,
    #[msg("Theatre rotations cannot start before the earliest start time")]
    TheatreTooEarly,
    #[msg("Caller is not authorised to reveal")]
    NotAuthorisedToReveal,
    #[msg("Curve operation failed")]
    CurveOpFailed,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Pact has already been accepted")]
    PactAlreadyAccepted,
    #[msg("Pact has been broken")]
    PactBroken,
}
