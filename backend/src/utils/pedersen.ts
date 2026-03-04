import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import crypto from "node:crypto";

const RistPoint = ristretto255.Point;

export const DOMAIN_SEP = "Solvasion:DefenceCommitment:H:v1";

export function deriveGeneratorH() {
  return ristretto255_hasher.hashToCurve(utf8ToBytes(DOMAIN_SEP));
}

const H = deriveGeneratorH();

/**
 * Create a Pedersen commitment: C = amount·G + blind·H
 * Returns commitment bytes (32) and the blind bytes used.
 */
export function createCommitment(
  amount: number,
  blindingFactor: Uint8Array
): { commitment: number[]; blind: number[] } {
  let blindBigInt = BigInt(0);
  for (let i = 0; i < 32; i++) {
    blindBigInt += BigInt(blindingFactor[i]) << BigInt(8 * i);
  }

  let C: InstanceType<typeof RistPoint>;
  if (amount === 0 && blindBigInt === BigInt(0)) {
    throw new Error("Both amount and blind are zero");
  } else if (amount === 0) {
    C = H.multiply(blindBigInt);
  } else if (blindBigInt === BigInt(0)) {
    C = RistPoint.BASE.multiply(BigInt(amount));
  } else {
    const aG = RistPoint.BASE.multiply(BigInt(amount));
    const rH = H.multiply(blindBigInt);
    C = aG.add(rH);
  }
  return {
    commitment: Array.from(C.toBytes()),
    blind: Array.from(blindingFactor),
  };
}

/**
 * Generate a random blinding factor that is a canonical Ristretto scalar (< group order).
 * Clears top 4 bits of byte[31] to guarantee value < 2^252 < ORDER.
 */
export function randomBlind(): Uint8Array {
  const bytes = crypto.randomBytes(32);
  bytes[31] &= 0x0f;
  return bytes;
}
