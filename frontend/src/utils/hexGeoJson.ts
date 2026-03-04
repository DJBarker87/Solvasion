import { cellToBoundary } from 'h3-js';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import type { EnrichedHex, HexFeatureProps } from '../types';
import { walletFillColor, COLORS } from './hexColors';

function hexToPolygon(h3Index: string): number[][] {
  // cellToBoundary returns [lat, lng][], Mapbox needs [lng, lat][]
  const boundary = cellToBoundary(h3Index);
  const coords = boundary.map(([lat, lng]) => [lng, lat]);
  // Close the ring
  coords.push(coords[0]);
  return coords;
}

function featureProps(hex: EnrichedHex): HexFeatureProps {
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
  };
}

export function buildHexGeoJson(hexes: EnrichedHex[]): FeatureCollection<Polygon, HexFeatureProps> {
  const features: Feature<Polygon, HexFeatureProps>[] = hexes.map((hex) => ({
    type: 'Feature',
    properties: featureProps(hex),
    geometry: {
      type: 'Polygon',
      coordinates: [hexToPolygon(hex.h3Index)],
    },
  }));

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
