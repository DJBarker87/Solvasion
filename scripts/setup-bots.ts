#!/usr/bin/env npx tsx
/**
 * Derives bot keypairs from BOT_SEED and prints their public keys + balances.
 *
 * Usage:
 *   BOT_SEED=mysecret npx tsx scripts/setup-bots.ts
 *   npx tsx scripts/setup-bots.ts --seed mysecret
 */
import crypto from "node:crypto";
import { Keypair, Connection } from "@solana/web3.js";

const BOT_NAMES = ["Centurion", "Vanguard", "Sentinel"] as const;
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

function deriveBotKeypair(botSeed: string, botName: string): Keypair {
  const hmac = crypto.createHmac("sha512", botSeed);
  hmac.update(botName);
  const derived = hmac.digest();
  return Keypair.fromSeed(derived.subarray(0, 32));
}

async function main() {
  // Parse seed from env or --seed flag
  let seed = process.env.BOT_SEED ?? "";
  const seedIdx = process.argv.indexOf("--seed");
  if (seedIdx !== -1 && process.argv[seedIdx + 1]) {
    seed = process.argv[seedIdx + 1];
  }

  if (!seed) {
    // Generate a random seed
    seed = crypto.randomBytes(32).toString("hex");
    console.log("No BOT_SEED provided — generated a random one:\n");
  }

  const connection = new Connection(RPC_URL, "confirmed");

  console.log("Bot keypairs:");
  console.log("─".repeat(60));

  for (const name of BOT_NAMES) {
    const kp = deriveBotKeypair(seed, name);
    let balance = 0;
    try {
      balance = await connection.getBalance(kp.publicKey);
    } catch {
      // offline
    }
    const sol = (balance / 1e9).toFixed(4);
    console.log(`  ${name.padEnd(12)} ${kp.publicKey.toBase58()}  (${sol} SOL)`);
  }

  console.log("\n─".repeat(60));
  console.log("\nAdd to your backend .env:");
  console.log(`BOT_SEED=${seed}`);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
