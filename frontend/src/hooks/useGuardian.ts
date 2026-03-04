import { useState, useCallback, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { uploadGuardianPacket } from '../api/guardian';
import * as ledger from '../solana/defenceLedger';

const STORAGE_KEY_PREFIX = 'solvasion:guardian:';

function getStorageKey(wallet: string): string {
  return `${STORAGE_KEY_PREFIX}${wallet}`;
}

export interface UseGuardianResult {
  enabled: boolean;
  toggle: () => void;
  uploadPacket: (seasonId: number, hexId: string, energyAmount: number, blindHex: string, nonce: number) => Promise<void>;
  syncAll: (seasonId: number) => Promise<void>;
  syncedHexes: Set<string>;
}

export function useGuardian(): UseGuardianResult {
  const { publicKey, signMessage } = useWallet();
  const walletStr = publicKey?.toBase58() ?? null;

  const [enabled, setEnabled] = useState<boolean>(() => {
    if (!walletStr) return false;
    return localStorage.getItem(getStorageKey(walletStr)) === '1';
  });

  const [syncedHexes, setSyncedHexes] = useState<Set<string>>(new Set());
  const syncedRef = useRef(syncedHexes);
  syncedRef.current = syncedHexes;

  // Re-read enabled state when wallet changes
  useEffect(() => {
    if (walletStr) {
      setEnabled(localStorage.getItem(getStorageKey(walletStr)) === '1');
    } else {
      setEnabled(false);
    }
    setSyncedHexes(new Set());
  }, [walletStr]);

  const toggle = useCallback(() => {
    if (!walletStr) return;
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem(getStorageKey(walletStr), next ? '1' : '0');
      return next;
    });
  }, [walletStr]);

  const uploadPacket = useCallback(async (
    seasonId: number,
    hexId: string,
    energyAmount: number,
    blindHex: string,
    nonce: number,
  ) => {
    if (!walletStr || !signMessage) return;

    const msg = `guardian:${seasonId}:${hexId}:${nonce}`;
    const encoded = new TextEncoder().encode(msg);
    const sigBytes = await signMessage(encoded);
    const signature = btoa(String.fromCharCode(...sigBytes));

    await uploadGuardianPacket({
      season_id: seasonId,
      player_wallet: walletStr,
      hex_id: hexId,
      energy_amount: energyAmount,
      blind_hex: blindHex,
      nonce,
      signature,
    });

    setSyncedHexes(prev => new Set(prev).add(hexId));
  }, [walletStr, signMessage]);

  const syncAll = useCallback(async (seasonId: number) => {
    if (!walletStr || !enabled) return;
    const entries = ledger.getAll(walletStr, seasonId);
    for (const entry of entries) {
      if (syncedRef.current.has(entry.hexId)) continue;
      try {
        await uploadPacket(seasonId, entry.hexId, entry.amount, entry.blind, entry.nonce);
      } catch (err) {
        console.warn(`Guardian sync failed for hex ${entry.hexId}:`, err);
      }
    }
  }, [walletStr, enabled, uploadPacket]);

  return { enabled, toggle, uploadPacket, syncAll, syncedHexes };
}
