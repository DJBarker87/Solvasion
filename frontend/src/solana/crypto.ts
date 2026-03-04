/**
 * Client-side Pedersen commitment generation for Solvasion.
 * C = amount·G + blind·H where H is derived via hash-to-curve.
 * Ported from tests/helpers.ts.
 */
import { ristretto255, ristretto255_hasher } from '@noble/curves/ed25519.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

const RistPoint = ristretto255.Point;

const DOMAIN_SEP = 'Solvasion:DefenceCommitment:H:v1';

/** Generator H — cached after first derivation. */
let _H: InstanceType<typeof RistPoint> | null = null;

export function deriveGeneratorH() {
  if (!_H) {
    _H = ristretto255_hasher.hashToCurve(utf8ToBytes(DOMAIN_SEP));
  }
  return _H;
}

/**
 * Generate a random blinding factor that is a canonical Ristretto scalar (< group order).
 * Clears top 4 bits of byte[31] so the 32-byte LE value is < 2^252 < ORDER.
 * This ensures the on-chain PodScalar is accepted by multiscalar_multiply_ristretto.
 */
export function randomBlind(): Uint8Array {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  bytes[31] &= 0x0f; // clear top 4 bits -> value < 2^252 < ORDER
  return bytes;
}

/**
 * Create a Pedersen commitment: C = amount·G + blind·H
 * Returns commitment bytes (32) and blind bytes (32) as number arrays (for Anchor).
 */
export function createCommitment(
  amount: number,
  blindingFactor: Uint8Array,
): { commitment: number[]; blind: number[] } {
  const H = deriveGeneratorH();

  // Convert blind bytes to BigInt (little-endian)
  let blindBigInt = BigInt(0);
  for (let i = 0; i < 32; i++) {
    blindBigInt += BigInt(blindingFactor[i]) << BigInt(8 * i);
  }

  let C: InstanceType<typeof RistPoint>;
  if (amount === 0 && blindBigInt === BigInt(0)) {
    throw new Error('Both amount and blind are zero');
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
