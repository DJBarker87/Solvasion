import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { config } from "../config.js";
import {
  findSeason, findPlayer, findHex, findAttack,
} from "./pda.js";
import { logger } from "./logger.js";

/**
 * Submit a reveal_defence transaction.
 * Used by both guardian service and bot controller.
 */
export async function submitRevealDefence(
  program: Program,
  seasonId: number,
  attackId: number,
  targetHex: string,
  attacker: string,
  defender: string,
  energyAmount: number,
  blind: Uint8Array
): Promise<string> {
  const programId = config.programId;
  const seasonBN = new BN(seasonId);
  const attackBN = new BN(attackId);
  const hexBN = new BN(targetHex);
  const attackerPk = new PublicKey(attacker);
  const defenderPk = new PublicKey(defender);

  const [seasonPda] = findSeason(programId, seasonBN);
  const [attackerPlayerPda] = findPlayer(programId, seasonBN, attackerPk);
  const [defenderPlayerPda] = findPlayer(programId, seasonBN, defenderPk);
  const [hexPda] = findHex(programId, seasonBN, hexBN);
  const [attackPda] = findAttack(programId, seasonBN, attackBN);

  const callerPk = (program.provider as any).wallet.publicKey;

  const sig = await program.methods
    .revealDefence(attackBN, energyAmount, Array.from(blind))
    .accounts({
      caller: callerPk,
      season: seasonPda,
      playerDefender: defenderPlayerPda,
      playerAttacker: attackerPlayerPda,
      hex: hexPda,
      attack: attackPda,
      attackerRentRecipient: attackerPk,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });

  logger.info("Reveal defence submitted", {
    seasonId: String(seasonId),
    attackId: String(attackId),
    targetHex,
    tx: sig,
  });

  return sig;
}
