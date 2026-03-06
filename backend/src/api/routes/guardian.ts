import type { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import crypto from "node:crypto";
import { getDb, preparedStatements } from "../../db.js";
import { encryptPacket } from "../../guardian/crypto.js";
import { isGuardianEnabled } from "../../guardian/index.js";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";
import { validateWallet } from "../../utils/validate.js";

// ---- Per-wallet rate limiter (10 uploads/min) ----
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;
const uploadTimestamps = new Map<string, number[]>();

function checkUploadRateLimit(wallet: string): boolean {
  const now = Date.now();
  let timestamps = uploadTimestamps.get(wallet);
  if (!timestamps) {
    timestamps = [];
    uploadTimestamps.set(wallet, timestamps);
  }
  // Prune old entries
  const cutoff = now - RATE_LIMIT_WINDOW;
  while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift();
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  return true;
}

/**
 * Verify an Ed25519 signature using Node.js crypto.
 * Solana wallets produce standard Ed25519 signatures.
 */
function verifyEd25519(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    const keyObj = crypto.createPublicKey({
      key: Buffer.concat([
        // Ed25519 public key DER prefix (12 bytes) + 32-byte raw key
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(publicKey),
      ]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, message, keyObj, Buffer.from(signature));
  } catch {
    return false;
  }
}

export function registerGuardianRoutes(app: FastifyInstance) {
  // Upload a reveal packet
  app.post<{
    Body: {
      season_id: number;
      player_wallet: string;
      hex_id: string;
      energy_amount: number;
      blind_hex: string;
      nonce: number;
      signature: string; // base64-encoded Ed25519 signature
    };
  }>("/api/guardian/packets", async (req, reply) => {
    if (!isGuardianEnabled()) {
      return reply.status(503).send({ error: "Guardian service not enabled" });
    }

    const { season_id, player_wallet, hex_id, energy_amount, blind_hex, nonce, signature } = req.body;

    // Validate wallet address
    if (player_wallet && !validateWallet(player_wallet)) {
      return reply.status(400).send({ error: "Invalid wallet address" });
    }

    // Validate inputs
    if (!season_id || !player_wallet || !hex_id || energy_amount == null || !blind_hex || nonce == null || !signature) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    // Verify blind is valid hex (64 chars = 32 bytes)
    if (!/^[0-9a-f]{64}$/i.test(blind_hex)) {
      return reply.status(400).send({ error: "blind_hex must be 64 hex chars" });
    }

    // Signature length validation (Ed25519 = 64 bytes)
    const signatureBytes = Buffer.from(signature, "base64");
    if (signatureBytes.length !== 64) {
      return reply.status(400).send({ error: "Signature must be exactly 64 bytes" });
    }

    // Per-wallet rate limiting
    if (!checkUploadRateLimit(player_wallet)) {
      return reply.status(429).send({ error: "Too many uploads. Max 10 per minute." });
    }

    // Verify signature: player signed "guardian:{season_id}:{hex_id}:{nonce}"
    const message = `guardian:${season_id}:${hex_id}:${nonce}`;
    const messageBytes = new TextEncoder().encode(message);
    const pubkeyBytes = new PublicKey(player_wallet).toBytes();

    if (!verifyEd25519(messageBytes, signatureBytes, pubkeyBytes)) {
      return reply.status(403).send({ error: "Invalid signature" });
    }

    // Encrypt and store
    const masterKey = Buffer.from(config.guardianMasterKey, "hex");
    const { encrypted, iv, authTag } = encryptPacket(
      { energy_amount, blind_hex, nonce },
      masterKey
    );

    const db = getDb();
    const stmts = preparedStatements(db);
    stmts.upsertGuardianPacket.run({
      season_id,
      player_wallet,
      hex_id,
      encrypted_blob: encrypted,
      iv,
      auth_tag: authTag,
      nonce,
      created_at: Math.floor(Date.now() / 1000),
    });

    logger.info("Guardian packet stored", {
      seasonId: String(season_id),
      wallet: player_wallet.slice(0, 8) + "...",
      hexId: hex_id,
    });

    return { ok: true };
  });

  // Delete a reveal packet (POST with body instead of DELETE with query params)
  app.post<{
    Params: { seasonId: string; hexId: string };
    Body: { wallet: string; signature: string };
  }>("/api/guardian/packets/:seasonId/:hexId/delete", async (req, reply) => {
    if (!isGuardianEnabled()) {
      return reply.status(503).send({ error: "Guardian service not enabled" });
    }

    const seasonId = parseInt(req.params.seasonId, 10);
    const hexId = req.params.hexId;
    const { wallet, signature } = req.body;

    if (!wallet || !signature) {
      return reply.status(400).send({ error: "Missing wallet or signature" });
    }
    if (!validateWallet(wallet)) {
      return reply.status(400).send({ error: "Invalid wallet address" });
    }

    // Signature length validation
    const sigBytes = Buffer.from(signature, "base64");
    if (sigBytes.length !== 64) {
      return reply.status(400).send({ error: "Signature must be exactly 64 bytes" });
    }

    // Verify signature: player signed "guardian:delete:{seasonId}:{hexId}"
    const message = `guardian:delete:${seasonId}:${hexId}`;
    const messageBytes = new TextEncoder().encode(message);
    const pubkeyBytes = new PublicKey(wallet).toBytes();

    if (!verifyEd25519(messageBytes, sigBytes, pubkeyBytes)) {
      return reply.status(403).send({ error: "Invalid signature" });
    }

    const db = getDb();
    const stmts = preparedStatements(db);
    const result = stmts.deleteGuardianPacket.run(seasonId, wallet, hexId);

    return { ok: true, deleted: result.changes > 0 };
  });
}
