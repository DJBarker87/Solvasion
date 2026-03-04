import { PublicKey } from "@solana/web3.js";
import path from "node:path";

export const config = {
  // Solana
  programId: new PublicKey(
    process.env.PROGRAM_ID ?? "98VnxqEX7SBwLGJVAVeLSfQPEUDGwBEpQWwugvjPeAfM"
  ),
  rpcUrl: process.env.RPC_URL ?? "https://api.devnet.solana.com",
  wsUrl: process.env.WS_URL ?? "wss://api.devnet.solana.com",
  commitment: (process.env.COMMITMENT ?? "confirmed") as "confirmed" | "finalized",

  // Crank
  crankKeypairPath:
    process.env.CRANK_KEYPAIR_PATH ?? `${process.env.HOME}/.config/solana/id.json`,
  crankMinBalance: 0.1, // SOL — warn if below

  // API
  port: parseInt(process.env.PORT ?? "3001", 10),
  host: process.env.HOST ?? "0.0.0.0",

  // Rate limiting
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX ?? "60", 10),
  rateLimitWindow: "1 minute" as const,
  mapRateLimitMax: parseInt(process.env.MAP_RATE_LIMIT_MAX ?? "10", 10),

  // Database
  dbPath: process.env.DB_PATH ?? path.resolve(import.meta.dirname, "../db/solvasion.sqlite"),

  // Intervals (ms)
  timeoutCheckInterval: 30_000,
  reconcileInterval: 120_000,
  finalizationInterval: 300_000,

  // WebSocket
  wsPingInterval: 30_000,
  wsMaxReplayEvents: 1000,

  // Guardian
  guardianKeypairPath: process.env.GUARDIAN_KEYPAIR_PATH ?? "",
  guardianMasterKey: process.env.GUARDIAN_MASTER_KEY ?? "",

  // Bots
  botSeed: process.env.BOT_SEED ?? "",
} as const;
