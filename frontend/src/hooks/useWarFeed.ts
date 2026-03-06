import { useState, useEffect, useRef } from 'react';
import type { FeedItem } from '../types';
import { fetchFeed } from '../api';

const POLL_INTERVAL = 30_000; // 30s (WS handles real-time updates)

export function useWarFeed(seasonId: number | null) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const lastIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!seasonId) return;

    // Reset on season change
    lastIdRef.current = 0;
    setItems([]);

    async function load() {
      try {
        const data = await fetchFeed(seasonId!, lastIdRef.current, 50);
        if (data.length > 0) {
          lastIdRef.current = data[data.length - 1].feed_id;
          setItems((prev) => [...prev, ...data].slice(-200)); // keep last 200
        }
      } catch {
        // silent
      }
    }

    load();
    timerRef.current = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [seasonId]);

  return items;
}
