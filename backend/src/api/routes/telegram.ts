import type { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import crypto from "node:crypto";
import { validateWallet } from "../../utils/validate.js";
import { verifyTelegramBinding, getPendingVerification } from "../../telegram/index.js";
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

export function registerTelegramRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      wallet: string;
      code: string;
      signature: string; // base64-encoded Ed25519 signature of "telegram:verify:{code}"
    };
  }>("/api/telegram/verify", async (req, reply) => {
    const { wallet, code, signature } = req.body ?? {};

    if (!wallet || !code || !signature) {
      return reply.status(400).send({ error: "Missing required fields: wallet, code, signature" });
    }

    if (!validateWallet(wallet)) {
      return reply.status(400).send({ error: "Invalid wallet address" });
    }

    // Validate code format (6 alphanumeric chars)
    if (!/^[A-Za-z0-9]{6}$/.test(code)) {
      return reply.status(400).send({ error: "Invalid verification code format" });
    }

    // Decode and validate signature length (Ed25519 = 64 bytes)
    const signatureBytes = Buffer.from(signature, "base64");
    if (signatureBytes.length !== 64) {
      return reply.status(400).send({ error: "Signature must be exactly 64 bytes" });
    }

    // Look up pending verification to get the chatId
    const pending = getPendingVerification(wallet);
    if (!pending) {
      return reply.status(404).send({ error: "No pending verification found for this wallet. Send /start <wallet> to the Telegram bot first." });
    }

    // Verify Ed25519 signature of the message "telegram:verify:{code}"
    const message = `telegram:verify:${code.toUpperCase()}`;
    const messageBytes = new TextEncoder().encode(message);
    const pubkeyBytes = new PublicKey(wallet).toBytes();

    if (!verifyEd25519(messageBytes, signatureBytes, pubkeyBytes)) {
      return reply.status(403).send({ error: "Invalid signature" });
    }

    // Activate the subscription
    const success = verifyTelegramBinding(wallet, code, pending.chatId);
    if (!success) {
      return reply.status(400).send({ error: "Verification failed. Code may have expired or does not match." });
    }

    logger.info("Telegram wallet verified via API", { wallet: wallet.slice(0, 8) + "..." });
    return { ok: true };
  });
}
