import BN from "bn.js";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { getDb, preparedStatements } from "../db.js";
import { getCrankProgram } from "../solana.js";
import { config } from "../config.js";
import { findSeason, findSeasonCounters, findPlayer, findHex } from "../utils/pda.js";
import { logger } from "../utils/logger.js";

/**
 * Run finalization pipeline for ended seasons:
 * 1. finalize_chunk — process player scores
 * 2. finalize_complete — mark finalization done
 * 3. close_season_hex — close hex accounts
 * 4. close_season_player — close player accounts
 */
export async function processFinalization() {
  const db = getDb();
  const stmts = preparedStatements(db);

  const seasons = stmts.getAllSeasons.all() as any[];
  const endedSeasons = seasons.filter(
    (s: any) => s.phase === "Ended" && !s.finalization_complete
  );

  if (endedSeasons.length === 0) return;

  const program = getCrankProgram();

  for (const season of endedSeasons) {
    try {
      await finalizeSeason(program, season, stmts);
    } catch (err) {
      logger.error(`Finalization failed for season ${season.season_id}`, {
        error: String(err),
      });
    }
  }
}

async function finalizeSeason(program: any, season: any, stmts: any) {
  const seasonId = new BN(season.season_id);
  const programId = config.programId;
  const [seasonPda] = findSeason(programId, seasonId);
  const [countersPda] = findSeasonCounters(programId, seasonId);

  // Get all non-finalized players
  const players = (stmts.getSeasonPlayers.all(season.season_id) as any[])
    .filter((p: any) => !p.finalized);

  if (players.length === 0) {
    // All players finalized — call finalize_complete
    logger.info(`All players finalized for season ${season.season_id}, completing...`);
    try {
      await program.methods
        .finalizeComplete()
        .accounts({
          cranker: program.provider.wallet.publicKey,
          season: seasonPda,
          seasonCounters: countersPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      logger.info(`Season ${season.season_id} finalization complete`);
    } catch (err) {
      logger.error(`finalize_complete failed`, { error: String(err) });
    }
    return;
  }

  // Process players in chunks
  const chunkSize = 5; // Process 5 players per finalize_chunk call
  const chunk = players.slice(0, chunkSize);

  logger.info(`Finalizing ${chunk.length} players for season ${season.season_id}`);

  for (const player of chunk) {
    try {
      const wallet = new PublicKey(player.wallet);
      const [playerPda] = findPlayer(programId, seasonId, wallet);

      await program.methods
        .finalizeChunk()
        .accounts({
          cranker: program.provider.wallet.publicKey,
          season: seasonPda,
          seasonCounters: countersPda,
          player: playerPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });

      stmts.updatePlayerFinalized.run({
        season_id: season.season_id,
        wallet: player.wallet,
      });
    } catch (err) {
      logger.error(`finalize_chunk failed for ${player.wallet}`, {
        error: String(err),
      });
    }
  }
}
