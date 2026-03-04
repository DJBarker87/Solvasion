#!/usr/bin/env tsx
/**
 * Verify that the H constant hardcoded in programs/solvasion/src/crypto.rs
 * matches the TypeScript derivation.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GENERATOR_G_BYTES,
  GENERATOR_H_BYTES,
  deriveGeneratorH,
} from "./crypto-constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse a PodRistrettoPoint byte array from a Rust source file.
 * Looks for a pattern like: pub const NAME: PodRistrettoPoint = PodRistrettoPoint([...]);
 */
function extractRustBytes(source: string, constName: string): Uint8Array {
  // Match the constant declaration and capture everything inside PodRistrettoPoint([...])
  const pattern = new RegExp(
    `pub\\s+const\\s+${constName}\\s*:\\s*PodRistrettoPoint\\s*=\\s*PodRistrettoPoint\\(\\[([^\\]]+)\\]\\)`,
    "s"
  );
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find constant '${constName}' in crypto.rs`);
  }

  // Extract hex byte literals (0x..)
  const hexLiterals = match[1].match(/0x[0-9a-fA-F]{2}/g);
  if (!hexLiterals || hexLiterals.length !== 32) {
    throw new Error(
      `Expected 32 bytes for '${constName}', found ${hexLiterals?.length ?? 0}`
    );
  }

  return new Uint8Array(hexLiterals.map((h) => parseInt(h, 16)));
}

// --- Read crypto.rs ---

const cryptoRsPath = resolve(
  __dirname,
  "..",
  "programs",
  "solvasion",
  "src",
  "crypto.rs"
);
const cryptoRs = readFileSync(cryptoRsPath, "utf-8");

// --- Extract and compare ---

const rustG = extractRustBytes(cryptoRs, "GENERATOR_G");
const rustH = extractRustBytes(cryptoRs, "GENERATOR_H");

const tsG = toHex(GENERATOR_G_BYTES);
const tsH = toHex(GENERATOR_H_BYTES);
const rsG = toHex(rustG);
const rsH = toHex(rustH);

console.log("=== Cross-verification: TypeScript ↔ Rust ===\n");

console.log(`TS  G: ${tsG}`);
console.log(`Rust G: ${rsG}`);
const gMatch = tsG === rsG;
console.log(`G match: ${gMatch ? "PASS" : "FAIL"}\n`);

console.log(`TS  H: ${tsH}`);
console.log(`Rust H: ${rsH}`);
const hMatch = tsH === rsH;
console.log(`H match: ${hMatch ? "PASS" : "FAIL"}\n`);

// Re-derive H from scratch as extra check
const freshH = toHex(deriveGeneratorH().toBytes());
const freshMatch = freshH === rsH;
console.log(`Fresh derivation matches Rust: ${freshMatch ? "PASS" : "FAIL"}`);

if (!gMatch || !hMatch || !freshMatch) {
  console.error("\nVerification FAILED — Rust constants are out of sync!");
  process.exit(1);
}

console.log("\nAll verifications passed. Rust constants are in sync.");
