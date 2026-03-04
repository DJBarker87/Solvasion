import { useState, useEffect, useRef } from 'react';
import type { Player } from '../types';
import { fetchLeaderboard } from '../api';

const POLL_INTERVAL = 60_000; // 60s

export function useLeaderboard(seasonId: number | null) {
  const [players, setPlayers] = useState<Player[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!seasonId) return;

    async function load() {
      try {
        const data = await fetchLeaderboard(seasonId!, 10);
        setPlayers(data);
      } catch {
        // silent
      }
    }

    load();
    timerRef.current = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [seasonId]);

  return players;
}
