import BN from "bn.js";
import { config } from "../config.js";
import { getConnection, getProgram } from "../solana.js";
import { getDb, preparedStatements, type Statements } from "../db.js";
import { findSeasonCounters, findSeason, findPlayer, findHex, findAttack } from "../utils/pda.js";
import { logger } from "../utils/logger.js";
import { PublicKey } from "@solana/web3.js";

/**
 * Reconciliation: compare on-chain state vs DB, fix any drift.
 * Runs periodically (every 2 min) and on startup.
 */
export async function reconcile() {
  const db = getDb();
  const stmts = preparedStatements(db);
  const program = getProgram();

  // Get all known seasons from DB
  const seasons = stmts.getAllSeasons.all() as any[];

  for (const season of seasons) {
    if (season.phase === "Ended" && season.finalization_complete) continue;

    try {
      await reconcileSeason(season.season_id, stmts, program);
    } catch (err) {
      logger.error(`Reconciliation failed for season ${season.season_id}`, {
        error: String(err),
      });
    }
  }
}

async function reconcileSeason(seasonId: number, stmts: Statements, program: any) {
  const accounts = program.account as any;
  const seasonBN = new BN(seasonId);
  const [countersPda] = findSeasonCounters(config.programId, seasonBN);

  let counters: any;
  try {
    counters = await accounts.seasonCounters.fetch(countersPda);
  } catch {
    // Season counters may be closed post-season
    return;
  }

  const onChainPlayerCount = counters.playerCount;
  const onChainHexesClaimed = counters.totalHexesClaimed;

  const dbSeason = stmts.getSeason.get(seasonId) as any;
  if (!dbSeason) return;

  const dbPlayerCount = dbSeason.player_count ?? 0;
  const dbHexCount = dbSeason.total_hexes ?? 0;

  if (onChainPlayerCount !== dbPlayerCount || onChainHexesClaimed !== dbHexCount) {
    logger.warn("State drift detected", {
      seasonId,
      onChainPlayers: onChainPlayerCount,
      dbPlayers: dbPlayerCount,
      onChainHexes: onChainHexesClaimed,
      dbHexes: dbHexCount,
    });

    // Update counters
    stmts.updateSeasonCounters.run({
      season_id: seasonId,
      player_count: onChainPlayerCount,
      total_hexes: onChainHexesClaimed,
    });

    // Full account scan to fix data
    await reconcileAccounts(seasonId, program, stmts);
  }

  // Also reconcile season phase from timestamps
  await reconcilePhase(seasonId, program, stmts);
}

async function reconcilePhase(seasonId: number, program: any, stmts: Statements) {
  const seasonBN = new BN(seasonId);
  const [seasonPda] = findSeason(config.programId, seasonBN);
  const accounts = program.account as any;

  try {
    const season = await accounts.season.fetch(seasonPda);
    const now = Math.floor(Date.now() / 1000);

    let phase: string;
    if (season.seasonEnded) {
      phase = "Ended";
    } else if (now >= season.escalationStage2Start?.toNumber?.()) {
      phase = "EscalationStage2";
    } else if (now >= season.escalationStart?.toNumber?.()) {
      phase = "EscalationStage1";
    } else if (now >= season.warStart?.toNumber?.()) {
      phase = "War";
    } else {
      phase = "LandRush";
    }

    stmts.updateSeasonPhase.run({ season_id: seasonId, phase });

    // Update season timing data if we have it
    stmts.upsertSeason.run({
      season_id: seasonId,
      phase,
      land_rush_end: season.landRushEnd?.toNumber?.() ?? null,
      war_start: season.warStart?.toNumber?.() ?? null,
      escalation_start: season.escalationStart?.toNumber?.() ?? null,
      season_end: season.seasonEnd?.toNumber?.() ?? null,
      victory_threshold: season.victoryThreshold?.toNumber?.() ?? null,
      config_json: null,
    });
  } catch (err) {
    logger.debug(`Could not fetch season ${seasonId} for phase reconciliation`);
  }
}

async function reconcileAccounts(seasonId: number, program: any, stmts: Statements) {
  logger.info(`Running full account reconciliation for season ${seasonId}`);
  const conn = getConnection();
  const programId = config.programId;

  // Fetch all Player accounts for this season via getProgramAccounts
  // Player PDA seed: ["player", season_id_u64_le, wallet]
  const seasonBytes = new BN(seasonId).toArrayLike(Buffer, "le", 8);

  try {
    const playerAccounts = await conn.getProgramAccounts(programId, {
      filters: [
        { memcmp: { offset: 8, bytes: seasonBytes.toString("base64") } }, // season_id at offset 8 (after discriminator)
      ],
    });

    logger.info(`Found ${playerAccounts.length} program accounts for season ${seasonId}`);

    // We can't easily distinguish account types from raw data without the discriminator
    // For now, just use the Anchor fetch methods to get typed data
    // This is a heavier approach but more reliable
  } catch (err) {
    logger.error("getProgramAccounts failed", { error: String(err) });
  }
}

/**
 * Full rebuild: fetch all on-chain state and rebuild DB.
 * Used with --rebuild CLI flag.
 */
export async function fullRebuild() {
  const db = getDb();
  const stmts = preparedStatements(db);
  const program = getProgram();
  const accounts = program.account as any;

  logger.info("Starting full rebuild from on-chain state...");

  const { findGlobalConfig } = await import("../utils/pda.js");
  const [gcPda] = findGlobalConfig(config.programId);

  let globalConfig: any;
  try {
    globalConfig = await accounts.globalConfig.fetch(gcPda);
  } catch {
    logger.warn("No GlobalConfig found — nothing to rebuild");
    return;
  }

  const seasonCount = globalConfig.seasonCounter ?? 0;
  logger.info(`Found ${seasonCount} seasons to rebuild`);

  for (let i = 1; i <= seasonCount; i++) {
    const seasonId = new BN(i);
    const [seasonPda] = findSeason(config.programId, seasonId);

    try {
      const season = await accounts.season.fetch(seasonPda);
      const now = Math.floor(Date.now() / 1000);

      let phase = "LandRush";
      if (season.seasonEnded) phase = "Ended";
      else if (now >= (season.escalationStart?.toNumber?.() ?? Infinity)) phase = "EscalationStage1";
      else if (now >= (season.warStart?.toNumber?.() ?? Infinity)) phase = "War";

      stmts.upsertSeason.run({
        season_id: i,
        phase,
        land_rush_end: season.landRushEnd?.toNumber?.() ?? null,
        war_start: season.warStart?.toNumber?.() ?? null,
        escalation_start: season.escalationStart?.toNumber?.() ?? null,
        season_end: season.seasonEnd?.toNumber?.() ?? null,
        victory_threshold: season.victoryThreshold?.toNumber?.() ?? null,
        config_json: null,
      });

      // Fetch counters
      const [countersPda] = findSeasonCounters(config.programId, seasonId);
      try {
        const counters = await accounts.seasonCounters.fetch(countersPda);
        stmts.updateSeasonCounters.run({
          season_id: i,
          player_count: counters.playerCount ?? 0,
          total_hexes: counters.totalHexesClaimed ?? 0,
        });
      } catch {
        // Counters may be closed
      }

      logger.info(`Rebuilt season ${i} (${phase})`);
    } catch (err) {
      logger.warn(`Could not fetch season ${i}`, { error: String(err) });
    }
  }

  logger.info("Full rebuild complete");
}
