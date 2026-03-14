/**
 * Defence ledger — stores blinding factors and garrison amounts in localStorage.
 * This is the only record of blinding factors — if lost, garrison cannot be revealed.
 *
 * Key: solvasion:defence:{wallet}:{seasonId}
 * Value: XOR-obfuscated + base64 encoded JSON array of DefenceLedgerEntry
 *
 * The obfuscation uses a key derived from wallet + salt. This prevents browser
 * extensions from finding blinding factors via simple JSON parsing of localStorage.
 */

export interface DefenceLedgerEntry {
  hexId: string;
  amount: number;
  blind: string;    // hex-encoded 32-byte blinding factor
  nonce: number;
  createdAt: number;
}

const OBFUSCATION_SALT = "solvasion:ledger:v1";

function storageKey(wallet: string, seasonId: number): string {
  return `solvasion:defence:${wallet}:${seasonId}`;
}

function obfuscate(data: string, wallet: string): string {
  const key = wallet + OBFUSCATION_SALT;
  const bytes = new TextEncoder().encode(data);
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...result));
}

function deobfuscate(b64: string, wallet: string): string {
  const key = wallet + OBFUSCATION_SALT;
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(result);
}

function load(wallet: string, seasonId: number): DefenceLedgerEntry[] {
  const raw = localStorage.getItem(storageKey(wallet, seasonId));
  if (!raw) return [];
  try {
    // Try deobfuscating first (new format)
    const json = deobfuscate(raw, wallet);
    return JSON.parse(json);
  } catch {
    // Fallback: try parsing as plaintext JSON (migration from old format)
    try {
      const entries = JSON.parse(raw) as DefenceLedgerEntry[];
      // Re-save in obfuscated format to complete migration
      save(wallet, seasonId, entries);
      return entries;
    } catch {
      return [];
    }
  }
}

function save(wallet: string, seasonId: number, entries: DefenceLedgerEntry[]) {
  const json = JSON.stringify(entries);
  localStorage.setItem(storageKey(wallet, seasonId), obfuscate(json, wallet));
}

/** Get the ledger entry for a specific hex. */
export function getEntry(wallet: string, seasonId: number, hexId: string): DefenceLedgerEntry | null {
  return load(wallet, seasonId).find(e => e.hexId === hexId) ?? null;
}

/** Get all entries for a wallet+season. */
export function getAll(wallet: string, seasonId: number): DefenceLedgerEntry[] {
  return load(wallet, seasonId);
}

/** Set or update the entry for a hex. */
export function setEntry(wallet: string, seasonId: number, entry: DefenceLedgerEntry) {
  const entries = load(wallet, seasonId).filter(e => e.hexId !== entry.hexId);
  entries.push(entry);
  save(wallet, seasonId, entries);
}

/** Remove the entry for a hex. */
export function removeEntry(wallet: string, seasonId: number, hexId: string) {
  const entries = load(wallet, seasonId).filter(e => e.hexId !== hexId);
  save(wallet, seasonId, entries);
}

/** Convert hex string to Uint8Array (for blind). */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Convert Uint8Array to hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
