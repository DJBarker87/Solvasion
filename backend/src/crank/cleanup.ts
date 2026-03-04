import BN from "bn.js";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getDb, preparedStatements } from "../db.js";
import { getCrankProgram } from "../solana.js";
import { config } from "../config.js";
import { findSeason, findPlayer, findHex, findGlobalConfig } from "../utils/pda.js";
import { logger } from "../utils/logger.js";

/**
 * Close hex and player accounts for finalized seasons.
 * Rent is returned to the original owner.
 */
export async function processCleanup() {
  const db = getDb();
  const stmts = preparedStatements(db);

  const seasons = stmts.getAllSeasons.all() as any[];
  const finalizedSeasons = seasons.filter((s: any) => s.finalization_complete);

  if (finalizedSeasons.length === 0) return;

  const program = getCrankProgram();
  const programId = config.programId;
  const [globalConfigPda] = findGlobalConfig(programId);

  for (const season of finalizedSeasons) {
    const seasonId = new BN(season.season_id);
    const [seasonPda] = findSeason(programId, seasonId);

    // Close hex accounts
    const hexes = stmts.getSeasonMap.all(season.season_id) as any[];
    for (const hex of hexes) {
      if (!hex.owner) continue;
      try {
        const hexBN = new BN(hex.hex_id);
        const [hexPda] = findHex(programId, seasonId, hexBN);
        const owner = new PublicKey(hex.owner);

        await program.methods
          .closeSeasonHex()
          .accounts({
            cranker: program.provider.wallet!.publicKey,
            globalConfig: globalConfigPda,
            season: seasonPda,
            hex: hexPda,
            hexOwner: owner,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: "confirmed", skipPreflight: true });

        logger.debug(`Closed hex ${hex.hex_id} for season ${season.season_id}`);
      } catch (err) {
        // Account may already be closed
        logger.debug(`close_season_hex skipped: ${String(err).slice(0, 80)}`);
      }
    }

    // Close player accounts
    const players = stmts.getSeasonPlayers.all(season.season_id) as any[];
    for (const player of players) {
      try {
        const wallet = new PublicKey(player.wallet);
        const [playerPda] = findPlayer(programId, seasonId, wallet);

        await program.methods
          .closeSeasonPlayer()
          .accounts({
            cranker: program.provider.wallet!.publicKey,
            globalConfig: globalConfigPda,
            season: seasonPda,
            player: playerPda,
            playerWallet: wallet,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: "confirmed", skipPreflight: true });

        logger.debug(`Closed player ${player.wallet} for season ${season.season_id}`);
      } catch (err) {
        logger.debug(`close_season_player skipped: ${String(err).slice(0, 80)}`);
      }
    }
  }
}
