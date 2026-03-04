#!/usr/bin/env tsx
/**
 * Derive generator H for Solvasion Pedersen commitments.
 *
 * Prints H as:
 *   - A hex string (for reference / debugging)
 *   - A Rust byte-array literal (for programs/solvasion/src/crypto.rs)
 *
 * Also prints G for completeness and runs sanity checks.
 */

import { ristretto255 } from "@noble/curves/ed25519.js";
import {
  DOMAIN_SEPARATOR_H,
  GENERATOR_G_BYTES,
  GENERATOR_H_BYTES,
  deriveGeneratorH,
} from "./crypto-constants.js";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toRustArray(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 8) {
    const chunk = Array.from(bytes.slice(i, i + 8))
      .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
      .join(", ");
    lines.push(`    ${chunk},`);
  }
  return `[\n${lines.join("\n")}\n]`;
}

// --- Derive and verify ---

console.log(`Domain separator: "${DOMAIN_SEPARATOR_H}"\n`);

// Generator G
console.log("=== Generator G (Ristretto255 basepoint) ===");
console.log(`Hex: ${toHex(GENERATOR_G_BYTES)}`);
console.log(`Rust: ${toRustArray(GENERATOR_G_BYTES)}`);
console.log();

// Generator H
console.log("=== Generator H (hash-to-curve) ===");
console.log(`Hex: ${toHex(GENERATOR_H_BYTES)}`);
console.log(`Rust: ${toRustArray(GENERATOR_H_BYTES)}`);
console.log();

// --- Sanity checks ---

// 1. Round-trip: decompress H bytes back to a point, re-compress
const roundTrip = ristretto255.Point.fromBytes(GENERATOR_H_BYTES);
const roundTripBytes = roundTrip.toBytes();
const rtMatch =
  toHex(roundTripBytes) === toHex(GENERATOR_H_BYTES);
console.log(`Round-trip check: ${rtMatch ? "PASS" : "FAIL"}`);

// 2. H ≠ identity (all zeros)
const allZeros = GENERATOR_H_BYTES.every((b) => b === 0);
console.log(`H ≠ identity:     ${!allZeros ? "PASS" : "FAIL"}`);

// 3. H ≠ G
const hEqualsG = toHex(GENERATOR_H_BYTES) === toHex(GENERATOR_G_BYTES);
console.log(`H ≠ G:            ${!hEqualsG ? "PASS" : "FAIL"}`);

// 4. Deterministic: derive again and compare
const h2 = deriveGeneratorH().toBytes();
const deterministic = toHex(h2) === toHex(GENERATOR_H_BYTES);
console.log(`Deterministic:    ${deterministic ? "PASS" : "FAIL"}`);

if (!rtMatch || allZeros || hEqualsG || !deterministic) {
  console.error("\nSanity checks FAILED!");
  process.exit(1);
}

console.log("\nAll checks passed.");
