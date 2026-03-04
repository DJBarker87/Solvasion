import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export interface RevealPacket {
  energy_amount: number;
  blind_hex: string; // hex-encoded 32-byte blinding factor
  nonce: number;
}

export interface EncryptedPacket {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Encrypt a reveal packet using AES-256-GCM.
 * masterKey must be a 32-byte Buffer (from hex env var).
 */
export function encryptPacket(packet: RevealPacket, masterKey: Buffer): EncryptedPacket {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

  const plaintext = JSON.stringify(packet);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return { encrypted, iv, authTag };
}

/**
 * Decrypt a reveal packet using AES-256-GCM.
 */
export function decryptPacket(
  encrypted: Buffer,
  iv: Buffer,
  authTag: Buffer,
  masterKey: Buffer
): RevealPacket {
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as RevealPacket;
}
