import type { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import crypto from "node:crypto";
import { getDb, preparedStatements } from "../../db.js";
import { encryptPacket } from "../../guardian/crypto.js";
import { isGuardianEnabled } from "../../guardian/index.js";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";

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

    // Validate inputs
    if (!season_id || !player_wallet || !hex_id || energy_amount == null || !blind_hex || nonce == null || !signature) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    // Verify blind is valid hex (64 chars = 32 bytes)
    if (!/^[0-9a-f]{64}$/i.test(blind_hex)) {
      return reply.status(400).send({ error: "blind_hex must be 64 hex chars" });
    }

    // Verify signature: player signed "guardian:{season_id}:{hex_id}:{nonce}"
    const message = `guardian:${season_id}:${hex_id}:${nonce}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, "base64");
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

  // Delete a reveal packet
  app.delete<{
    Params: { seasonId: string; hexId: string };
    Querystring: { wallet: string; signature: string };
  }>("/api/guardian/packets/:seasonId/:hexId", async (req, reply) => {
    if (!isGuardianEnabled()) {
      return reply.status(503).send({ error: "Guardian service not enabled" });
    }

    const seasonId = parseInt(req.params.seasonId, 10);
    const hexId = req.params.hexId;
    const { wallet, signature } = req.query;

    if (!wallet || !signature) {
      return reply.status(400).send({ error: "Missing wallet or signature query params" });
    }

    // Verify signature: player signed "guardian:delete:{seasonId}:{hexId}"
    const message = `guardian:delete:${seasonId}:${hexId}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, "base64");
    const pubkeyBytes = new PublicKey(wallet).toBytes();

    if (!verifyEd25519(messageBytes, signatureBytes, pubkeyBytes)) {
      return reply.status(403).send({ error: "Invalid signature" });
    }

    const db = getDb();
    const stmts = preparedStatements(db);
    const result = stmts.deleteGuardianPacket.run(seasonId, wallet, hexId);

    return { ok: true, deleted: result.changes > 0 };
  });
}
