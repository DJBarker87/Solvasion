import { Connection, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import fs from "node:fs";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

// Load IDL at startup
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const idl = require("../../target/idl/solvasion.json");

let connection: Connection;
let program: Program;
let crankKeypair: Keypair;

export function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(config.rpcUrl, {
      commitment: config.commitment,
      wsEndpoint: config.wsUrl,
    });
  }
  return connection;
}

export function getProgram(): Program {
  if (!program) {
    const conn = getConnection();
    // Read-only provider (no signing needed for reads)
    const wallet = {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    const provider = new anchor.AnchorProvider(conn, wallet as any, {
      commitment: config.commitment,
    });
    program = new Program(idl, provider);
  }
  return program;
}

export function getCrankKeypair(): Keypair {
  if (!crankKeypair) {
    crankKeypair = loadKeypair(config.crankKeypairPath, "CRANK_KEYPAIR");
    logger.info(`Crank wallet: ${crankKeypair.publicKey.toBase58()}`);
  }
  return crankKeypair;
}

/**
 * Load a keypair from a file path or inline JSON env var.
 * Supports: file path, JSON array string "[1,2,3,...]", or base64-encoded secret key.
 */
export function loadKeypair(pathOrJson: string, label = "keypair"): Keypair {
  let raw: string;

  if (pathOrJson.startsWith("[") || pathOrJson.startsWith("ey")) {
    // Inline JSON array or base64
    raw = pathOrJson;
  } else {
    // File path
    raw = fs.readFileSync(pathOrJson, "utf-8").trim();
  }

  if (raw.startsWith("[")) {
    const keyData = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(keyData));
  }

  // Try base64
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 64) {
    return Keypair.fromSecretKey(decoded);
  }

  throw new Error(`${label}: could not parse as JSON array or base64`);
}

export function getCrankProvider(): anchor.AnchorProvider {
  const conn = getConnection();
  const kp = getCrankKeypair();
  const wallet = new anchor.Wallet(kp);
  return new anchor.AnchorProvider(conn, wallet, {
    commitment: config.commitment,
    skipPreflight: true,
  });
}

export function getCrankProgram(): Program {
  const provider = getCrankProvider();
  return new Program(idl, provider);
}

export async function checkCrankBalance(): Promise<number> {
  const conn = getConnection();
  const kp = getCrankKeypair();
  const balance = await conn.getBalance(kp.publicKey);
  const sol = balance / 1e9;
  if (sol < config.crankMinBalance) {
    logger.warn(`Crank balance low: ${sol.toFixed(4)} SOL (min: ${config.crankMinBalance})`);
  } else {
    logger.info(`Crank balance: ${sol.toFixed(4)} SOL`);
  }
  return sol;
}

export { idl };
