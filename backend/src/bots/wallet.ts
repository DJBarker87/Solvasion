import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import crypto from "node:crypto";
import { getConnection, getCrankKeypair } from "../solana.js";
import { logger } from "../utils/logger.js";

export const BOT_NAMES = ["Centurion", "Vanguard", "Sentinel"] as const;
export type BotName = (typeof BOT_NAMES)[number];

/**
 * Derive a deterministic keypair for a bot from the master seed.
 * HMAC-SHA512(seed, botName) → first 32 bytes → Keypair.fromSeed()
 */
export function deriveBotKeypair(botSeed: string, botName: string): Keypair {
  const hmac = crypto.createHmac("sha512", botSeed);
  hmac.update(botName);
  const derived = hmac.digest();
  return Keypair.fromSeed(derived.subarray(0, 32));
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
