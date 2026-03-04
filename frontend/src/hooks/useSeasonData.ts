import { useState, useEffect } from 'react';
import type { Season, Region } from '../types';
import { fetchSeasons, fetchSeason } from '../api';

export function useActiveSeason() {
  const [season, setSeason] = useState<Season | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const seasons = await fetchSeasons();
        // Find most recent non-Ended season, or fall back to latest
        const active = seasons.find((s) => s.phase !== 'Ended') ?? seasons[seasons.length - 1] ?? null;

        if (active && !cancelled) {
          const detail = await fetchSeason(active.season_id);
          setSeason(detail.season);
          setRegions(detail.regions);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { season, regions, loading, error };
}
