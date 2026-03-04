import type { MapDataFile, LandmarkEntry, RegionSummary } from '../types';
import { buildAdjacencyMap } from './adjacency';

export interface MapLookups {
  u64ToH3: Map<string, string>;
  h3ToU64: Map<string, string>;
  u64ToRegionId: Map<string, number>;
  landmarksByU64: Map<string, LandmarkEntry>;
  landmarksByH3: Map<string, LandmarkEntry>;
  regionSummary: Map<number, RegionSummary>;
  allU64Ids: string[];
  allH3Ids: string[];
}

let cached: MapLookups | null = null;

export async function loadMapData(): Promise<MapLookups> {
  if (cached) return cached;

  const res = await fetch('/map-data-western.json');
  const data: MapDataFile = await res.json();

  const u64ToH3 = new Map<string, string>();
  const h3ToU64 = new Map<string, string>();
  const u64ToRegionId = new Map<string, number>();

  for (let i = 0; i < data.hex_ids.length; i++) {
    const u64 = data.hex_ids[i];
    const h3 = data.hex_ids_h3[i];
    u64ToH3.set(u64, h3);
    h3ToU64.set(h3, u64);
    u64ToRegionId.set(u64, data.region_ids[i]);
  }

  const landmarksByU64 = new Map<string, LandmarkEntry>();
  const landmarksByH3 = new Map<string, LandmarkEntry>();
  for (const lm of data.landmarks) {
    landmarksByU64.set(lm.hex_u64, lm);
    landmarksByH3.set(lm.hex_h3, lm);
  }

  const regionSummary = new Map<number, RegionSummary>();
  for (const r of data.region_summary) {
    regionSummary.set(r.id, r);
  }

  // Build adjacency map from edges
  const edges: [string, string][] = (data as any).adjacency_edges ?? [];
  buildAdjacencyMap(edges);

  cached = {
    u64ToH3,
    h3ToU64,
    u64ToRegionId,
    landmarksByU64,
    landmarksByH3,
    regionSummary,
    allU64Ids: data.hex_ids,
    allH3Ids: data.hex_ids_h3,
  };

  return cached;
}
