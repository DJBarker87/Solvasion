import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import crypto from "node:crypto";
import { getConnection, getCrankKeypair } from "../solana.js";
import { logger } from "../utils/logger.js";

export const BOT_NAMES = [
  "RomanLegion",
  "NorseRaiders",
  "OttomanEmpire",
  "HanseaticLeague",
  "AlpineConfederacy",
] as const;
export type BotName = (typeof BOT_NAMES)[number];

/**
 * Derive a deterministic keypair for a bot from the master seed.
 * HMAC-SHA512(seed, botName) → first 32 bytes → Keypair.fromSeed()
 */
export function deriveBotKeypair(botSeed: string, botName: string): Keypair {
  if (botSeed.length < 32) {
    throw new Error("BOT_SEED must be at least 32 characters for security. Generate with: openssl rand -hex 32");
  }
  const hmac = crypto.createHmac("sha512", botSeed);
  hmac.update(botName);
  const derived = hmac.digest();
  return Keypair.fromSeed(derived.subarray(0, 32));
}

/**
 * Derive a deterministic blinding factor for a bot's hex commitment.
 * HMAC-SHA512(botSeed, "blind:{botName}:{hexId}:{nonce}") → first 32 bytes.
 * Top 4 bits of byte[31] cleared for scalar canonicality (< 2^252 < group order).
 *
 * This means bot blinding factors never need to be stored — they can be
 * re-derived at reveal time from (BOT_SEED, botName, hexId, nonce).
 */
export function deriveBotBlind(botSeed: string, botName: string, hexId: string, nonce: number): Buffer {
  const hmac = crypto.createHmac("sha512", botSeed);
  hmac.update(`blind:${botName}:${hexId}:${nonce}`);
  const derived = hmac.digest().subarray(0, 32);
  // Clear top 4 bits of byte 31 for scalar canonicality (< 2^252 < group order)
  derived[31] &= 0x0f;
  return derived;
}

/**
 * Ensure a bot wallet has at least minBalance SOL.
 * Transfers from the crank wallet if needed.
 */
export async function ensureBotFunded(
  botKeypair: Keypair,
  minBalance = 0.05,
  fundAmount = 0.1
): Promise<void> {
  const conn = getConnection();
  const balance = await conn.getBalance(botKeypair.publicKey);
  const sol = balance / 1e9;

  if (sol >= minBalance) return;

  const crankKp = getCrankKeypair();
  const lamports = Math.round(fundAmount * 1e9);

  logger.info(`Funding bot ${botKeypair.publicKey.toBase58().slice(0, 8)}... with ${fundAmount} SOL`);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: crankKp.publicKey,
      toPubkey: botKeypair.publicKey,
      lamports,
    })
  );

  await sendAndConfirmTransaction(conn, tx, [crankKp], {
    commitment: "confirmed",
  });
}
