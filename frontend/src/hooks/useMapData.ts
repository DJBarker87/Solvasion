import { useState, useEffect, useRef, useCallback } from 'react';
import type { EnrichedHex } from '../types';
import { fetchMap } from '../api';
import type { MapLookups } from '../utils/mapData';

const POLL_INTERVAL = 30_000; // 30s

export function useMapData(seasonId: number | null, lookups: MapLookups | null) {
  const [hexes, setHexes] = useState<EnrichedHex[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const load = useCallback(async () => {
    if (!seasonId || !lookups) return;

    try {
      setLoading(true);
      const rows = await fetchMap(seasonId);

      // Build set of hex IDs we got from the backend
      const rowMap = new Map(rows.map((r) => [r.hex_id, r]));

      // Enrich all map hexes (even unclaimed ones won't be in backend)
      const enriched: EnrichedHex[] = lookups.allU64Ids.map((u64, i) => {
        const h3 = lookups.allH3Ids[i];
        const rid = lookups.u64ToRegionId.get(u64) ?? 0;
        const region = lookups.regionSummary.get(rid);
        const lm = lookups.landmarksByU64.get(u64);
        const row = rowMap.get(u64);

        return {
          hexId: u64,
          h3Index: h3,
          regionId: rid,
          regionName: region?.name ?? 'Unknown',
          landmarkName: lm?.name ?? null,
          owner: row?.owner ?? null,
          isLandmark: lm !== undefined,
          hasCommitment: row?.has_commitment === 1,
          underAttack: row?.under_attack === 1,
          claimedAt: row?.claimed_at ?? null,
        };
      });

      setHexes(enriched);
    } catch {
      // Silently fail on poll errors — previous data stays
    } finally {
      setLoading(false);
    }
  }, [seasonId, lookups]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  return { hexes, loading, refresh: load };
}
