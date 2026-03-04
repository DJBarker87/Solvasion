/**
 * Solvasion H3 Map Generation Script
 *
 * Generates the land hex map for a Solvasion season at H3 resolution 3.
 * Produces sorted arrays matching the on-chain ValidHexSet and AdjacencySet formats.
 *
 * Usage:
 *   npx tsx generate-map.ts --season western   # Season 1: Western Theatre (~200 hexes)
 *   npx tsx generate-map.ts --season full       # Full Europe (~710 hexes)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  polygonToCells,
  gridDisk,
  cellToLatLng,
  latLngToCell,
} from "h3-js";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Season presets
// ---------------------------------------------------------------------------

interface SeasonPreset {
  name: string;
  description: string;
  regions: Set<number>;
  easternMarchesCutoffLng: number | null; // null = no cutoff
}

const SEASON_PRESETS: Record<string, SeasonPreset> = {
  western: {
    name: "Western Theatre",
    description: "UK, Iberia, France, Low Countries, Alps, Italy, Central Europe",
    regions: new Set([1, 2, 3, 4, 5, 6, 8]),
    easternMarchesCutoffLng: null, // no Eastern Marches in this preset
  },
  full: {
    name: "Full Europe",
    description: "All 12 regions, Russia cut east of Moscow (38°E)",
    regions: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    easternMarchesCutoffLng: 38,
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const H3_RESOLUTION = 3;

// Europe bounding box (lat/lng) — deliberately generous, region filter does the real work
const EUROPE_BBOX = {
  west: -25,
  east: 45,
  south: 34,
  north: 72,
};

// 24 major European city landmarks: [lat, lng, name, region_id]
const LANDMARK_CITIES: [number, number, string, number][] = [
  [51.5074, -0.1278, "London", 1],
  [48.8566, 2.3522, "Paris", 3],
  [52.52, 13.405, "Berlin", 8],
  [41.9028, 12.4964, "Rome", 6],
  [40.4168, -3.7038, "Madrid", 2],
  [52.3676, 4.9041, "Amsterdam", 4],
  [48.2082, 16.3738, "Vienna", 5],
  [59.3293, 18.0686, "Stockholm", 9],
  [41.0082, 28.9784, "Istanbul", 12],
  [55.7558, 37.6173, "Moscow", 11],
  [53.3498, -6.2603, "Dublin", 1],
  [38.7223, -9.1393, "Lisbon", 2],
  [37.9838, 23.7275, "Athens", 7],
  [52.2297, 21.0122, "Warsaw", 8],
  [50.0755, 14.4378, "Prague", 8],
  [55.6761, 12.5683, "Copenhagen", 9],
  [59.9139, 10.7522, "Oslo", 9],
  [60.1699, 24.9384, "Helsinki", 9],
  [44.4268, 26.1025, "Bucharest", 7],
  [47.4979, 19.0402, "Budapest", 8],
  [50.4501, 30.5234, "Kyiv", 11],
  [47.3769, 8.5417, "Zurich", 5],
  [50.8503, 4.3517, "Brussels", 4],
  [39.9334, 32.8597, "Ankara", 12],
];

// ISO A3 → region ID mapping (spec Section 2.8.2)
const ISO_TO_REGION: Record<string, number> = {
  GBR: 1, IRL: 1,
  ESP: 2, PRT: 2,
  FRA: 3,
  BEL: 4, NLD: 4, LUX: 4,
  CHE: 5, AUT: 5,
  ITA: 6,
  GRC: 7, ALB: 7, MKD: 7, BGR: 7, ROU: 7, SRB: 7, HRV: 7,
  BIH: 7, MNE: 7, XKX: 7, KOS: 7, SVN: 7,
  DEU: 8, POL: 8, CZE: 8, SVK: 8, HUN: 8,
  NOR: 9, SWE: 9, DNK: 9, FIN: 9, ISL: 9,
  EST: 10, LVA: 10, LTU: 10,
  UKR: 11, BLR: 11, RUS: 11, MDA: 11,
  TUR: 12, CYP: 12, GEO: 12, ARM: 12, AZE: 12,
};

const REGION_NAMES: Record<number, string> = {
  1: "British Isles",
  2: "Iberian Peninsula",
  3: "Gallic Heartland",
  4: "Low Countries",
  5: "Alpine Corridor",
  6: "Italian Peninsula",
  7: "Balkans",
  8: "Central Europe",
  9: "Scandinavia",
  10: "Baltic States",
  11: "Eastern Marches",
  12: "Anatolian Gate",
};

// Lat/lng fallback for coastal hexes outside country polygons
function fallbackRegion(lat: number, lng: number): number {
  if (lat > 63 && lng < -13) return 9;               // Iceland
  if (lat > 49 && lat < 62 && lng > -11 && lng < 2) return 1;  // British Isles
  if (lat < 44 && lng < 0 && lng > -10) return 2;    // Iberia
  if (lat > 55 && lng > 4 && lng < 32) return 9;     // Scandinavia
  if (lat > 53.5 && lat < 60 && lng > 20 && lng < 29) return 10; // Baltics
  if (lat > 44 && lng > 28 && lng < 45) return 11;   // Eastern Marches
  if (lat < 44 && lng > 25) return 12;                // Anatolian Gate
  if (lat < 47 && lat > 35 && lng > 6 && lng < 19) return 6;  // Italy
  if (lat < 47 && lat > 35 && lng > 13 && lng < 30) return 7; // Balkans
  if (lat > 42 && lat < 52 && lng > -5 && lng < 8) return 3;  // France
  if (lat > 49 && lat < 54 && lng > 2 && lng < 8) return 4;   // Low Countries
  if (lat > 45 && lat < 49 && lng > 5 && lng < 17) return 5;  // Alps
  if (lat > 47 && lat < 55 && lng > 8 && lng < 25) return 8;  // Central Europe
  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function h3ToU64(h3Index: string): bigint {
  return BigInt("0x" + h3Index);
}

function loadGeoJSON(filename: string): GeoJSON.FeatureCollection {
  const raw = readFileSync(resolve(__dirname, "data", filename), "utf-8");
  return JSON.parse(raw);
}

/** BFS from a start hex, returns set of all reachable hexes */
function bfsComponent(start: string, adj: Map<string, string[]>): Set<string> {
  const component = new Set<string>();
  const queue = [start];
  component.add(start);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adj.get(current) || []) {
      if (!component.has(neighbor)) {
        component.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return component;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse --season argument
  const seasonArg = process.argv.find((a) => a.startsWith("--season"));
  let seasonKey = "western"; // default
  if (seasonArg) {
    const idx = process.argv.indexOf(seasonArg);
    if (seasonArg.includes("=")) {
      seasonKey = seasonArg.split("=")[1];
    } else if (process.argv[idx + 1]) {
      seasonKey = process.argv[idx + 1];
    }
  }

  const preset = SEASON_PRESETS[seasonKey];
  if (!preset) {
    console.error(`Unknown season preset: "${seasonKey}". Available: ${Object.keys(SEASON_PRESETS).join(", ")}`);
    process.exit(1);
  }

  console.log(`=== Solvasion H3 Map Generator ===`);
  console.log(`Season preset: ${preset.name} (--season ${seasonKey})`);
  console.log(`Description: ${preset.description}`);
  console.log(`H3 resolution: ${H3_RESOLUTION}\n`);

  // ── Step 1: Load GeoJSON data ──
  console.log("Loading GeoJSON data...");
  const landGeoJSON = loadGeoJSON("ne_50m_land.geojson");
  const countriesGeoJSON = loadGeoJSON("ne_50m_admin_0_countries.geojson");

  const europeanISOs = new Set(Object.keys(ISO_TO_REGION));
  const europeanCountries = countriesGeoJSON.features.filter((f) => {
    const iso = f.properties?.ISO_A3 || f.properties?.ADM0_A3;
    return europeanISOs.has(iso);
  });
  console.log(
    `  Land features: ${landGeoJSON.features.length}, European country features: ${europeanCountries.length}`
  );

  // ── Step 2: Enumerate hexes in bounding box ──
  console.log("\nEnumerating H3 hexes...");
  const bboxPolygon: [number, number][] = [
    [EUROPE_BBOX.south, EUROPE_BBOX.west],
    [EUROPE_BBOX.south, EUROPE_BBOX.east],
    [EUROPE_BBOX.north, EUROPE_BBOX.east],
    [EUROPE_BBOX.north, EUROPE_BBOX.west],
    [EUROPE_BBOX.south, EUROPE_BBOX.west],
  ];
  // isGeoJson=false → coordinates are [lat, lng] (h3-js native order)
  const allHexes = polygonToCells(bboxPolygon, H3_RESOLUTION, false);
  console.log(`  Total hexes in bounding box: ${allHexes.length}`);

  // ── Step 3: Classify hexes (country polygon → land fallback → skip) ──
  console.log("\nClassifying hexes...");
  const hexRegions = new Map<string, number>();
  let countryMatchCount = 0;
  let landFallbackCount = 0;

  for (const hex of allHexes) {
    const [lat, lng] = cellToLatLng(hex);
    const pt = turfPoint([lng, lat]); // Turf expects [lng, lat]

    // Try European country polygons
    let regionId: number | null = null;
    for (const feature of europeanCountries) {
      if (
        feature.geometry.type === "Polygon" ||
        feature.geometry.type === "MultiPolygon"
      ) {
        if (booleanPointInPolygon(pt, feature as any)) {
          const iso = feature.properties?.ISO_A3 || feature.properties?.ADM0_A3;
          regionId = ISO_TO_REGION[iso] ?? null;
          break;
        }
      }
    }

    if (regionId !== null) {
      hexRegions.set(hex, regionId);
      countryMatchCount++;
      continue;
    }

    // Land polygon fallback for coastal hexes
    for (const feature of landGeoJSON.features) {
      if (
        feature.geometry.type === "Polygon" ||
        feature.geometry.type === "MultiPolygon"
      ) {
        if (booleanPointInPolygon(pt, feature as any)) {
          const fb = fallbackRegion(lat, lng);
          if (fb > 0) {
            hexRegions.set(hex, fb);
            landFallbackCount++;
          }
          break;
        }
      }
    }
  }
  console.log(
    `  Classified: ${hexRegions.size} hexes (${countryMatchCount} country, ${landFallbackCount} land fallback)`
  );

  // ── Step 4: Apply season filters (region whitelist + longitude cutoff) ──
  console.log("\nApplying season filters...");
  let landHexes: string[] = [];

  for (const [hex, region] of hexRegions) {
    // Region whitelist
    if (!preset.regions.has(region)) continue;

    // Eastern Marches longitude cutoff
    if (region === 11 && preset.easternMarchesCutoffLng !== null) {
      const [, lng] = cellToLatLng(hex);
      if (lng > preset.easternMarchesCutoffLng) continue;
    }

    landHexes.push(hex);
  }
  console.log(`  After region filter: ${landHexes.length} hexes`);

  // ── Step 5: Add landmark hexes (auto-add if missing from land set) ──
  console.log("\nAssigning landmarks...");
  const landHexSet = new Set(landHexes);
  const seasonLandmarks: { name: string; hex: string; regionId: number }[] = [];
  const landmarkHexIds = new Set<string>();

  for (const [lat, lng, name, regionId] of LANDMARK_CITIES) {
    if (!preset.regions.has(regionId)) continue; // skip landmarks outside season regions

    const hex = latLngToCell(lat, lng, H3_RESOLUTION);

    if (!landHexSet.has(hex)) {
      console.log(`  Auto-adding coastal hex for ${name}`);
      landHexes.push(hex);
      landHexSet.add(hex);
      hexRegions.set(hex, regionId);
    }

    if (landmarkHexIds.has(hex)) {
      const existing = seasonLandmarks.find((l) => l.hex === hex);
      console.warn(`  WARN: ${name} shares hex with ${existing?.name}!`);
    }

    landmarkHexIds.add(hex);
    seasonLandmarks.push({ name, hex, regionId });
  }
  console.log(`  Landmarks: ${seasonLandmarks.length} (${landmarkHexIds.size} unique hexes)`);

  // ── Step 6: Build adjacency + enforce single connected component ──
  console.log("\nComputing adjacency...");
  const adjMap = new Map<string, string[]>();
  for (const hex of landHexes) adjMap.set(hex, []);

  const edgeSet = new Set<string>();
  const rawEdges: [string, string][] = [];

  for (const hex of landHexes) {
    if (!landHexSet.has(hex)) continue;
    for (const neighbor of gridDisk(hex, 1)) {
      if (neighbor === hex || !landHexSet.has(neighbor)) continue;
      const hv = h3ToU64(hex);
      const nv = h3ToU64(neighbor);
      const a = hv < nv ? hex : neighbor;
      const b = hv < nv ? neighbor : hex;
      const key = `${a}:${b}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        rawEdges.push([a, b]);
        adjMap.get(hex)!.push(neighbor);
        adjMap.get(neighbor)!.push(hex);
      }
    }
  }
  console.log(`  Raw edges: ${rawEdges.length}`);

  // Find all connected components
  const visited = new Set<string>();
  const components: { hexes: Set<string>; size: number }[] = [];
  for (const hex of landHexes) {
    if (visited.has(hex)) continue;
    const comp = bfsComponent(hex, adjMap);
    for (const h of comp) visited.add(h);
    components.push({ hexes: comp, size: comp.size });
  }
  components.sort((a, b) => b.size - a.size);

  console.log(`  Connected components: ${components.length}`);
  for (const c of components) {
    const sample = [...c.hexes][0];
    const [lat, lng] = cellToLatLng(sample);
    console.log(`    Size ${c.size}: ~${lat.toFixed(0)}°N ${lng.toFixed(0)}°E`);
  }

  // Bridge disconnected components to the main landmass.
  // For each island, find the closest hex pair (island ↔ mainland) within
  // gridDisk radius 2 (one water hex gap). If no ring-2 bridge exists,
  // try ring 3. Add a synthetic adjacency edge to connect them.
  // Tiny islands (1-2 hexes) with no bridge are dropped.
  const mainComponent = components[0].hexes;
  const bridgeEdges: { from: string; to: string; name: string }[] = [];
  const droppedIslands: { size: number; lat: number; lng: number }[] = [];

  // Human-readable bridge names based on the island being connected
  function bridgeName(islandLat: number, islandLng: number, islandSize: number): string {
    if (islandLat > 49 && islandLng < 2 && islandSize > 10) return "English Channel Crossing";
    if (islandLat > 49 && islandLng < -4 && islandSize > 3) return "Irish Sea Crossing";
    if (islandLat > 63 && islandLng < -13) return "Iceland Ferry";
    if (islandLat < 39 && islandLng > 12 && islandLng < 16) return "Strait of Messina";
    if (islandLat > 40 && islandLat < 43 && islandLng > 8 && islandLng < 10) return "Corsica-Sardinia Ferry";
    if (islandLat > 38 && islandLat < 40 && islandLng > 8 && islandLng < 10) return "Sardinia Ferry";
    if (islandLat < 36 && islandLng > 23) return "Crete Ferry";
    if (islandLat > 55 && islandLng > 11 && islandLng < 16) return "Oresund Crossing";
    return `Sea Bridge (~${islandLat.toFixed(0)}°N ${islandLng.toFixed(0)}°E)`;
  }

  if (components.length > 1) {
    console.log("\n  Bridging disconnected islands to mainland...");

    for (let ci = 1; ci < components.length; ci++) {
      const island = components[ci].hexes;
      let bridged = false;

      // Try ring 2 first, then ring 3
      for (const radius of [2, 3]) {
        if (bridged) break;
        for (const islandHex of island) {
          if (bridged) break;
          const ring = gridDisk(islandHex, radius);
          for (const candidate of ring) {
            if (candidate === islandHex) continue;
            if (!mainComponent.has(candidate)) continue;
            // Found a bridge! Add synthetic edge
            const hv = h3ToU64(islandHex);
            const cv = h3ToU64(candidate);
            const a = hv < cv ? islandHex : candidate;
            const b = hv < cv ? candidate : islandHex;
            const key = `${a}:${b}`;
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              rawEdges.push([a, b]);
            }
            const [blat, blng] = cellToLatLng(islandHex);
            const bname = bridgeName(blat, blng, island.size);
            bridgeEdges.push({ from: a, to: b, name: bname });
            // Merge island into main component
            for (const h of island) mainComponent.add(h);
            console.log(
              `    ${bname}: ${island.size} hexes bridged via ring-${radius} edge`
            );
            bridged = true;
            break;
          }
        }
      }

      if (!bridged) {
        // No bridge found — drop this island
        const sample = [...island][0];
        const [lat, lng] = cellToLatLng(sample);
        droppedIslands.push({ size: island.size, lat, lng });
      }
    }

    // Remove hexes from dropped islands
    if (droppedIslands.length > 0) {
      for (const hex of landHexes) {
        if (!mainComponent.has(hex)) {
          landHexSet.delete(hex);
        }
      }
      landHexes = landHexes.filter((h) => landHexSet.has(h));

      // Remove dropped landmarks
      for (let i = seasonLandmarks.length - 1; i >= 0; i--) {
        if (!landHexSet.has(seasonLandmarks[i].hex)) {
          console.warn(`    Dropped landmark: ${seasonLandmarks[i].name} (unbridgeable island)`);
          seasonLandmarks.splice(i, 1);
        }
      }

      console.log(
        `    Dropped ${droppedIslands.length} unbridgeable island(s): ${droppedIslands.map((d) => `${d.size} hexes ~${d.lat.toFixed(0)}°N ${d.lng.toFixed(0)}°E`).join(", ")}`
      );
    }

    console.log(`  Bridge edges added: ${bridgeEdges.length}`);
    console.log(`  Final hex count: ${landHexes.length}`);
  }

  // Rebuild edges for the final hex set
  const finalEdges: [string, string][] = [];
  for (const [a, b] of rawEdges) {
    if (landHexSet.has(a) && landHexSet.has(b)) {
      finalEdges.push([a, b]);
    }
  }

  // ── Step 7: Sort ──
  console.log("\nSorting...");
  const sortedHexes = [...new Set(landHexes)].sort((a, b) => {
    const av = h3ToU64(a), bv = h3ToU64(b);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });

  const sortedRegionIds = sortedHexes.map((h) => hexRegions.get(h)!);

  const sortedEdges = [...finalEdges].sort((a, b) => {
    const a0 = h3ToU64(a[0]), b0 = h3ToU64(b[0]);
    if (a0 < b0) return -1;
    if (a0 > b0) return 1;
    const a1 = h3ToU64(a[1]), b1 = h3ToU64(b[1]);
    return a1 < b1 ? -1 : a1 > b1 ? 1 : 0;
  });

  // ── Step 8: Verification ──
  console.log("\n=== Verification ===\n");
  const hexCount = sortedHexes.length;
  const edgeCount = sortedEdges.length;

  // Sorted check
  let hexSorted = true;
  for (let i = 1; i < sortedHexes.length; i++) {
    if (h3ToU64(sortedHexes[i]) <= h3ToU64(sortedHexes[i - 1])) { hexSorted = false; break; }
  }
  let edgeSorted = true;
  for (let i = 1; i < sortedEdges.length; i++) {
    const p0 = h3ToU64(sortedEdges[i - 1][0]), c0 = h3ToU64(sortedEdges[i][0]);
    if (c0 < p0) { edgeSorted = false; break; }
    if (c0 === p0) {
      if (h3ToU64(sortedEdges[i][1]) <= h3ToU64(sortedEdges[i - 1][1])) { edgeSorted = false; break; }
    }
  }

  // Duplicate check
  const edgeKeys = new Set(sortedEdges.map((e) => `${e[0]}:${e[1]}`));
  const noDupes = edgeKeys.size === sortedEdges.length;

  // All have regions
  const allRegions = sortedHexes.every((h) => hexRegions.has(h));

  // Connectivity (should be 100% now)
  const finalAdj = new Map<string, string[]>();
  for (const h of sortedHexes) finalAdj.set(h, []);
  for (const [a, b] of sortedEdges) { finalAdj.get(a)?.push(b); finalAdj.get(b)?.push(a); }
  const mainComp = bfsComponent(sortedHexes[0], finalAdj);

  const pass = (ok: boolean) => ok ? "✓" : "✗ FAIL";
  console.log(`Hex count:          ${hexCount} ${pass(hexCount > 0)}`);
  console.log(`Edge count:         ${edgeCount} ${pass(edgeCount > 0)}`);
  console.log(`Landmark count:     ${seasonLandmarks.length}`);
  console.log(`All hexes sorted:   ${pass(hexSorted)}`);
  console.log(`All edges sorted:   ${pass(edgeSorted)}`);
  console.log(`No duplicate edges: ${pass(noDupes)}`);
  console.log(`All hexes regional: ${pass(allRegions)}`);
  console.log(`Single component:   ${mainComp.size}/${hexCount} ${pass(mainComp.size === hexCount)}`);

  // Bridge integrity: each bridge edge appears exactly once, both endpoints in valid hex set
  const sortedHexSet = new Set(sortedHexes);
  const sortedEdgeKeys = new Set(sortedEdges.map(([a, b]) => `${a}:${b}`));
  let bridgesOk = true;
  for (const bridge of bridgeEdges) {
    const key = `${bridge.from}:${bridge.to}`;
    if (!sortedEdgeKeys.has(key)) {
      console.log(`  ✗ Bridge "${bridge.name}" missing from sorted edges!`);
      bridgesOk = false;
    }
    if (!sortedHexSet.has(bridge.from) || !sortedHexSet.has(bridge.to)) {
      console.log(`  ✗ Bridge "${bridge.name}" endpoint not in valid hex set!`);
      bridgesOk = false;
    }
  }
  console.log(`Bridge integrity:   ${bridgeEdges.length} bridges ${pass(bridgesOk)}`);

  // On-chain sizes
  const validHexSetBytes = hexCount * 9;
  const adjacencySetBytes = edgeCount * 16;
  console.log(`\nOn-chain sizes:`);
  console.log(`  ValidHexSet:  ${validHexSetBytes} bytes (${(validHexSetBytes / 1024).toFixed(1)} KB)`);
  console.log(`  AdjacencySet: ${adjacencySetBytes} bytes (${(adjacencySetBytes / 1024).toFixed(1)} KB)`);
  console.log(`  Rent: ~${(((validHexSetBytes + adjacencySetBytes + 256) * 6960) / 1e9).toFixed(3)} SOL`);

  // Region summary
  console.log("\nRegion summary:");
  const regionCounts = new Map<number, number>();
  for (const r of sortedRegionIds) regionCounts.set(r, (regionCounts.get(r) || 0) + 1);

  const regionSummary: { id: number; name: string; hexCount: number }[] = [];
  for (let i = 1; i <= 12; i++) {
    const count = regionCounts.get(i) || 0;
    if (count === 0 && !preset.regions.has(i)) continue;
    regionSummary.push({ id: i, name: REGION_NAMES[i], hexCount: count });
    console.log(`  ${i.toString().padStart(2)}. ${REGION_NAMES[i].padEnd(20)} ${count} hexes`);
  }

  // Landmarks
  console.log("\nLandmarks:");
  for (const lm of seasonLandmarks) {
    console.log(`  ${lm.name.padEnd(14)} ${lm.hex} → ${REGION_NAMES[lm.regionId]}`);
  }

  // Bridge summary
  if (bridgeEdges.length > 0) {
    console.log("\nBridge edges (sea crossings):");
    for (const b of bridgeEdges) {
      console.log(`  ${b.name}: ${b.from} ↔ ${b.to}`);
    }
  }

  // ── Step 9: Output ──
  const output = {
    metadata: {
      generated: new Date().toISOString(),
      season_preset: seasonKey,
      season_name: preset.name,
      h3_resolution: H3_RESOLUTION,
      bounding_box: EUROPE_BBOX,
      hex_count: hexCount,
      edge_count: edgeCount,
      landmark_count: seasonLandmarks.length,
      single_component: mainComp.size === hexCount,
      bridge_count: bridgeEdges.length,
      valid_hex_set_bytes: validHexSetBytes,
      adjacency_set_bytes: adjacencySetBytes,
    },
    hex_ids: sortedHexes.map((h) => h3ToU64(h).toString()),
    hex_ids_h3: sortedHexes,
    region_ids: sortedRegionIds,
    adjacency_edges: sortedEdges.map(([a, b]) => [
      h3ToU64(a).toString(),
      h3ToU64(b).toString(),
    ]),
    adjacency_edges_h3: sortedEdges,
    landmarks: seasonLandmarks.map((lm) => ({
      name: lm.name,
      hex_h3: lm.hex,
      hex_u64: h3ToU64(lm.hex).toString(),
      region_id: lm.regionId,
      region_name: REGION_NAMES[lm.regionId],
    })),
    bridge_edges: bridgeEdges.map((b) => ({
      name: b.name,
      hex_a_h3: b.from,
      hex_b_h3: b.to,
      hex_a_u64: h3ToU64(b.from).toString(),
      hex_b_u64: h3ToU64(b.to).toString(),
    })),
    region_summary: regionSummary,
  };

  const outputPath = resolve(__dirname, "output", `map-data-${seasonKey}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nWritten to: ${outputPath}`);
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
