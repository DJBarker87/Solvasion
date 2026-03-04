/**
 * Defence ledger — stores blinding factors and garrison amounts in localStorage.
 * This is the only record of blinding factors — if lost, garrison cannot be revealed.
 *
 * Key: solvasion:defence:{wallet}:{seasonId}
 * Value: JSON array of DefenceLedgerEntry
 */

export interface DefenceLedgerEntry {
  hexId: string;
  amount: number;
  blind: string;    // hex-encoded 32-byte blinding factor
  nonce: number;
  createdAt: number;
}

function storageKey(wallet: string, seasonId: number): string {
  return `solvasion:defence:${wallet}:${seasonId}`;
}

function load(wallet: string, seasonId: number): DefenceLedgerEntry[] {
  const raw = localStorage.getItem(storageKey(wallet, seasonId));
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function save(wallet: string, seasonId: number, entries: DefenceLedgerEntry[]) {
  localStorage.setItem(storageKey(wallet, seasonId), JSON.stringify(entries));
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
