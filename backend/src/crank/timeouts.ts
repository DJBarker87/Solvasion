import BN from "bn.js";
import { SystemProgram } from "@solana/web3.js";
import { getDb, preparedStatements } from "../db.js";
import { getCrankProgram } from "../solana.js";
import { config } from "../config.js";
import {
  findSeason, findSeasonCounters, findPlayer, findHex, findAttack,
} from "../utils/pda.js";
import { logger } from "../utils/logger.js";
import { PublicKey } from "@solana/web3.js";

/**
 * Check for expired attacks and submit resolve_timeout transactions.
 */
export async function processTimeouts() {
  const db = getDb();
  const stmts = preparedStatements(db);
  const now = Math.floor(Date.now() / 1000);

  const expired = stmts.getExpiredAttacks.all(now) as any[];
  if (expired.length === 0) return;

  logger.info(`Found ${expired.length} expired attacks to resolve`);
  const program = getCrankProgram();

  for (const attack of expired) {
    try {
      await resolveTimeout(program, attack);
      logger.info(`Resolved timeout: season=${attack.season_id} attack=${attack.attack_id}`);
    } catch (err: any) {
      const errMsg = String(err);
      // Skip if already resolved on-chain
      if (errMsg.includes("already in use") || errMsg.includes("custom program error")) {
        logger.debug(`Attack ${attack.attack_id} already resolved on-chain`);
        // Mark as resolved in DB to avoid retrying
        stmts.updateAttackResolved.run({
          season_id: attack.season_id,
          attack_id: attack.attack_id,
          result: "Timeout",
          resolved_at: now,
          attacker_committed: attack.energy_committed ?? 0,
          defender_revealed: 0,
          attacker_surplus_returned: 0,
          attacker_refund: 0,
          guardian_reveal: 0,
        });
      } else {
        logger.error(`Failed to resolve timeout: attack=${attack.attack_id}`, {
          error: errMsg,
        });
      }
    }
  }
}

async function resolveTimeout(program: any, attack: any) {
  const seasonId = new BN(attack.season_id);
  const attackId = new BN(attack.attack_id);
  const hexId = new BN(attack.target_hex);
  const attacker = new PublicKey(attack.attacker);
  const defender = new PublicKey(attack.defender);
  const programId = config.programId;

  const [seasonPda] = findSeason(programId, seasonId);
  const [countersPda] = findSeasonCounters(programId, seasonId);
  const [attackPda] = findAttack(programId, seasonId, attackId);
  const [hexPda] = findHex(programId, seasonId, hexId);
  const [attackerPlayerPda] = findPlayer(programId, seasonId, attacker);
  const [defenderPlayerPda] = findPlayer(programId, seasonId, defender);

  await program.methods
    .resolveTimeout()
    .accounts({
      cranker: program.provider.wallet.publicKey,
      season: seasonPda,
      seasonCounters: countersPda,
      attack: attackPda,
      hex: hexPda,
      attackerPlayer: attackerPlayerPda,
      defenderPlayer: defenderPlayerPda,
      attacker: attacker,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
}
