/**
 * Shared cryptographic constants for Solvasion Pedersen commitments.
 *
 * Generator G: standard Ristretto255 basepoint.
 * Generator H: derived via hash-to-curve from a domain separator so that
 *   nobody knows the discrete log relationship between G and H.
 *
 * Used by client-side commitment code and the derive/verify scripts.
 */

import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/** Domain separator used to derive generator H. */
export const DOMAIN_SEPARATOR_H = "Solvasion:DefenceCommitment:H:v1";

/**
 * Derive generator H by hashing the domain separator to a Ristretto255 point.
 * Deterministic — always returns the same point.
 */
export function deriveGeneratorH(): InstanceType<typeof ristretto255.Point> {
  return ristretto255_hasher.hashToCurve(utf8ToBytes(DOMAIN_SEPARATOR_H));
}

/** Standard Ristretto255 basepoint G (compressed, 32 bytes). */
export const GENERATOR_G_BYTES: Uint8Array = ristretto255.Point.BASE.toBytes();

/** Generator H (compressed, 32 bytes). Computed once at import time. */
export const GENERATOR_H_BYTES: Uint8Array = deriveGeneratorH().toBytes();
