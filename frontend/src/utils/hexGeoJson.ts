import { cellToBoundary } from 'h3-js';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { EnrichedHex, HexFeatureProps } from '../types';
import { walletFillColor, COLORS } from './hexColors';
import { getAdjacent } from './adjacency';

function hexToPolygon(h3Index: string): number[][] {
  // cellToBoundary returns [lat, lng][], Mapbox needs [lng, lat][]
  const boundary = cellToBoundary(h3Index);
  const coords = boundary.map(([lat, lng]) => [lng, lat]);
  // Close the ring
  coords.push(coords[0]);
  return coords;
}

/**
 * BFS from player's hexes to compute hop distance for fog-of-war.
 * Returns a Map from hexId → hop distance (0 = player's own hex).
 */
function computeHopDistances(hexes: EnrichedHex[], playerWallet: string): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: string[] = [];

  for (const hex of hexes) {
    if (hex.owner === playerWallet) {
      distances.set(hex.hexId, 0);
      queue.push(hex.hexId);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];
    const dist = distances.get(current)!;
    if (dist >= 2) continue; // only need up to 2 hops

    const neighbors = getAdjacent(current);
    for (const n of neighbors) {
      if (!distances.has(n)) {
        distances.set(n, dist + 1);
        queue.push(n);
      }
    }
  }

  return distances;
}

const OPACITY_BY_HOP: Record<number, number> = {
  0: 0.8,   // player's own hexes
  1: 0.6,   // adjacent
  2: 0.4,   // 2 hops
};
const OPACITY_FAR = 0.2;       // 3+ hops
const OPACITY_UNCLAIMED = 0.15;

function featureProps(hex: EnrichedHex, opacity: number): HexFeatureProps {
  const owned = hex.owner !== null;

  let fillColor: string = COLORS.unownedFill;
  if (owned) {
    fillColor = walletFillColor(hex.owner!);
  }

  let lineColor: string = owned ? COLORS.defaultLine : COLORS.unownedLine;
  let lineWidth = 1;

  if (hex.underAttack) {
    lineColor = COLORS.underAttackLine;
    lineWidth = 2.5;
  } else if (hex.isLandmark) {
    lineColor = COLORS.landmarkLine;
    lineWidth = 2;
  } else if (hex.hasCommitment) {
    lineColor = COLORS.garrisonedLine;
    lineWidth = 1.5;
  }

  return {
    hexId: hex.hexId,
    h3Index: hex.h3Index,
    fillColor,
    lineColor,
    lineWidth,
    regionName: hex.regionName,
    landmarkName: hex.landmarkName,
    owner: hex.owner,
    isLandmark: hex.isLandmark,
    hasCommitment: hex.hasCommitment,
    underAttack: hex.underAttack,
    underAttackDash: hex.underAttack,
    opacity,
  };
}

export interface FogOptions {
  enabled: boolean;
  playerWallet: string | null;
}

export function buildHexGeoJson(
  hexes: EnrichedHex[],
  fog?: FogOptions,
): FeatureCollection<Polygon, HexFeatureProps> {
  let hopDistances: Map<string, number> | null = null;
  if (fog?.enabled && fog.playerWallet) {
    hopDistances = computeHopDistances(hexes, fog.playerWallet);
  }

  const features: Feature<Polygon, HexFeatureProps>[] = hexes.map((hex) => {
    let opacity = 1;
    if (hopDistances) {
      if (hex.owner === null) {
        opacity = OPACITY_UNCLAIMED;
      } else {
        const dist = hopDistances.get(hex.hexId);
        opacity = dist !== undefined ? (OPACITY_BY_HOP[dist] ?? OPACITY_FAR) : OPACITY_FAR;
      }
    }

    return {
      type: 'Feature' as const,
      properties: featureProps(hex, opacity),
      geometry: {
        type: 'Polygon' as const,
        coordinates: [hexToPolygon(hex.h3Index)],
      },
    };
  });

  return { type: 'FeatureCollection', features };
}

// Static fallback: all hexes unclaimed (used when no season or backend)
export function buildStaticHexGeoJson(
  h3Ids: string[],
  u64Ids: string[],
  regionNames: Map<number, string>,
  regionIds: Map<string, number>,
  landmarks: Map<string, { name: string }>,
): FeatureCollection<Polygon, HexFeatureProps> {
  const hexes: EnrichedHex[] = h3Ids.map((h3, i) => {
    const u64 = u64Ids[i];
    const rid = regionIds.get(u64) ?? 0;
    const lm = landmarks.get(u64);
    return {
      hexId: u64,
      h3Index: h3,
      regionId: rid,
      regionName: regionNames.get(rid) ?? 'Unknown',
      landmarkName: lm?.name ?? null,
      owner: null,
      isLandmark: lm !== undefined,
      hasCommitment: false,
      underAttack: false,
      claimedAt: null,
    };
  });
  return buildHexGeoJson(hexes);
}
