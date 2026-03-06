import { PublicKey } from "@solana/web3.js";

const BASE58_CHARS = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;

export function validateWallet(wallet: string): boolean {
  if (typeof wallet !== "string") return false;
  if (wallet.length < 32 || wallet.length > 44) return false;
  if (!BASE58_CHARS.test(wallet)) return false;
  try {
    new PublicKey(wallet);
    return true;
  } catch {
    return false;
  }
}
