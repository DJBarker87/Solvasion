import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { fetchPlayer } from '../api';
import type { Player } from '../types';

/** Polls backend for connected player's data every 15s. */
export function usePlayerData(seasonId: number | null): {
  player: Player | null;
  loading: boolean;
  refresh: () => void;
} {
  const { publicKey } = useWallet();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);

  const wallet = publicKey?.toBase58() ?? null;

  const refresh = useCallback(() => {
    if (!seasonId || !wallet) return;
    setLoading(true);
    fetchPlayer(seasonId, wallet)
      .then(setPlayer)
      .catch(() => setPlayer(null))
      .finally(() => setLoading(false));
  }, [seasonId, wallet]);

  useEffect(() => {
    if (!seasonId || !wallet) {
      setPlayer(null);
      return;
    }

    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [seasonId, wallet, refresh]);

  return { player, loading, refresh };
}
