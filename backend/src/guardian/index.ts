import { Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import fs from "node:fs";
import { config } from "../config.js";
import { getConnection, idl } from "../solana.js";
import { getDb, preparedStatements } from "../db.js";
import { decryptPacket } from "./crypto.js";
import { submitRevealDefence } from "../utils/reveal.js";
import { logger } from "../utils/logger.js";

let guardianKeypair: Keypair | null = null;
let guardianProgram: Program | null = null;
let masterKey: Buffer | null = null;
let enabled = false;

export interface AttackData {
  seasonId: number;
  attackId: number;
  attacker: string;
  defender: string;
  targetHex: string;
}

export function startGuardian(): boolean {
  if (!config.guardianKeypairPath || !config.guardianMasterKey) {
    logger.info("Guardian disabled — GUARDIAN_KEYPAIR_PATH or GUARDIAN_MASTER_KEY not set");
    return false;
  }

  try {
    // Load keypair
    const keyData = JSON.parse(fs.readFileSync(config.guardianKeypairPath, "utf-8"));
    guardianKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));

    // Parse master key (64-char hex string → 32-byte Buffer)
    masterKey = Buffer.from(config.guardianMasterKey, "hex");
    if (masterKey.length !== 32) {
      logger.error("GUARDIAN_MASTER_KEY must be 64 hex chars (32 bytes)");
      return false;
    }

    // Create signing program
    const conn = getConnection();
    const wallet = new anchor.Wallet(guardianKeypair);
    const provider = new anchor.AnchorProvider(conn, wallet, {
      commitment: config.commitment,
      skipPreflight: true,
    });
    guardianProgram = new Program(idl, provider);

    enabled = true;
    logger.info(`Guardian service enabled — wallet: ${guardianKeypair.publicKey.toBase58()}`);
    return true;
  } catch (err) {
    logger.error("Failed to start guardian service", { error: String(err) });
    return false;
  }
}

/**
 * Called when an AttackLaunched event is indexed.
 * Looks up stored reveal packet for the defender, decrypts, and auto-reveals.
 */
export async function onAttackLaunched(data: AttackData): Promise<void> {
  if (!enabled || !guardianKeypair || !guardianProgram || !masterKey) return;

  const { seasonId, attackId, attacker, defender, targetHex } = data;

  const db = getDb();
  const stmts = preparedStatements(db);

  // Look up stored packet
  const packet = stmts.getGuardianPacket.get(seasonId, defender, targetHex) as any;
  if (!packet) {
    logger.debug(`No guardian packet for season=${seasonId} defender=${defender.slice(0, 8)}... hex=${targetHex}`);
    return;
  }

  // Decrypt
  let revealed;
  try {
    revealed = decryptPacket(
      packet.encrypted_blob,
      packet.iv,
      packet.auth_tag,
      masterKey
    );
  } catch (err) {
    logger.error("Failed to decrypt guardian packet", {
      error: String(err),
      seasonId: String(seasonId),
      hexId: targetHex,
    });
    return;
  }

  // Reconstruct blind bytes from hex
  const blindBytes = Buffer.from(revealed.blind_hex, "hex");
  if (blindBytes.length !== 32) {
    logger.error("Invalid blind length in guardian packet", { length: String(blindBytes.length) });
    return;
  }

  // Submit reveal with exponential backoff
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      await submitRevealDefence(
        guardianProgram,
        seasonId,
        attackId,
        targetHex,
        attacker,
        defender,
        revealed.energy_amount,
        blindBytes
      );

      logger.info("Guardian reveal submitted", {
        seasonId: String(seasonId),
        attackId: String(attackId),
        hexId: targetHex,
        defender: defender.slice(0, 8) + "...",
      });

      // Delete consumed packet (commitment is consumed on any reveal)
      stmts.deleteGuardianPacket.run(seasonId, defender, targetHex);
      return;
    } catch (err: any) {
      const errMsg = String(err);
      // If attack already resolved, no point retrying
      if (errMsg.includes("AttackAlreadyResolved") || errMsg.includes("already in use")) {
        logger.debug("Attack already resolved, skipping guardian reveal", {
          attackId: String(attackId),
        });
        stmts.deleteGuardianPacket.run(seasonId, defender, targetHex);
        return;
      }

      if (attempt < delays.length - 1) {
        logger.warn(`Guardian reveal attempt ${attempt + 1} failed, retrying in ${delays[attempt]}ms`, {
          error: errMsg,
        });
        await new Promise((r) => setTimeout(r, delays[attempt]));
      } else {
        logger.error("Guardian reveal failed after all retries", {
          error: errMsg,
          seasonId: String(seasonId),
          attackId: String(attackId),
          hexId: targetHex,
        });
      }
    }
  }
}

export function isGuardianEnabled(): boolean {
  return enabled;
}

export function getGuardianPublicKey(): string | null {
  return guardianKeypair?.publicKey.toBase58() ?? null;
}
