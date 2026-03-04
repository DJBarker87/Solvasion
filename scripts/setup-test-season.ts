#!/usr/bin/env npx tsx
/**
 * Creates a test season on devnet with short durations and the Western Theatre map.
 *
 * Usage: npx tsx scripts/setup-test-season.ts
 *
 * Reads deployer keypair from ~/.config/solana/id.json (or ANCHOR_WALLET).
 * Requires: @coral-xyz/anchor, @solana/web3.js (from root package.json)
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROGRAM_ID = new PublicKey("98VnxqEX7SBwLGJVAVeLSfQPEUDGwBEpQWwugvjPeAfM");
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

// ---- PDA helpers ----

function findGlobalConfig(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("global_config")], PROGRAM_ID);
}

function findSeason(seasonId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("season"), seasonId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
}

function findSeasonCounters(seasonId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("season_counters"), seasonId.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
}

function findValidHexSet(seasonId: BN, chunkIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("valid_hexes"), seasonId.toArrayLike(Buffer, "le", 8), Buffer.from([chunkIndex])],
    PROGRAM_ID,
  );
}

function findAdjacencySet(seasonId: BN, chunkIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("adjacency"), seasonId.toArrayLike(Buffer, "le", 8), Buffer.from([chunkIndex])],
    PROGRAM_ID,
  );
}

// ---- Load map data ----

interface MapData {
  hex_ids: string[];
  region_ids: number[];
  landmarks: Array<{ hex_u64: string }>;
  metadata: { edge_count: number };
}

function loadMapData(): { hexIds: BN[]; regionIds: number[]; edges: [BN, BN][]; landmarks: BN[] } {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "output/map-data-western.json"), "utf-8"),
  ) as MapData & { adjacency_edges?: string[][] };

  const hexIds = raw.hex_ids.map((id: string) => new BN(id));
  const regionIds = raw.region_ids;
  const landmarks = raw.landmarks.map((l: { hex_u64: string }) => new BN(l.hex_u64));

  // adjacency_edges is an array of [hexA_u64, hexB_u64] pairs
  let edgePairs: string[][] = [];
  if (raw.adjacency_edges) {
    edgePairs = raw.adjacency_edges;
  } else if ((raw as any).edges) {
    edgePairs = (raw as any).edges;
  }

  const edges: [BN, BN][] = edgePairs.map(([a, b]: string[]) => [new BN(a), new BN(b)]);

  return { hexIds, regionIds, edges, landmarks };
}

// ---- Chunking ----

const HEX_CHUNK_SIZE = 50;   // hexes per append_hex_data call
const EDGE_CHUNK_SIZE = 40;  // edges per append_adjacency_data call

async function delay(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

// ---- Main ----

async function main() {
  // Load wallet
  const walletPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(secretKey));

  console.log(`Admin: ${admin.publicKey.toBase58()}`);
  console.log(`RPC: ${RPC_URL}`);

  // Set up Anchor
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(admin);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  anchor.setProvider(provider);

  // Load IDL
  const idlPath = path.join(__dirname, "../target/idl/solvasion.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  // Get or create GlobalConfig
  const [globalConfigPda] = findGlobalConfig();
  let globalConfig: any;
  try {
    globalConfig = await (program.account as any).globalConfig.fetch(globalConfigPda);
  } catch {
    console.log("Initializing GlobalConfig...");
    await program.methods
      .initialize()
      .accounts({
        admin: admin.publicKey,
        globalConfig: globalConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await delay(2000);
    globalConfig = await (program.account as any).globalConfig.fetch(globalConfigPda);
  }

  const seasonId = new BN(globalConfig.seasonCounter.toNumber() + 1);
  console.log(`\nCreating season ${seasonId.toString()}...`);

  // Short durations for testing
  const now = Math.floor(Date.now() / 1000);
  const landRushEnd = new BN(now + 5 * 60);       // 5 minutes
  const warStart = new BN(now + 5 * 60);           // war starts after land rush
  const escalationStart = new BN(now + 15 * 60);   // escalation at 15 min
  const seasonEnd = new BN(now + 25 * 60);         // season ends at 25 min
  const joinCutoff = new BN(now + 20 * 60);
  const escalation2 = new BN(now + 20 * 60);

  const { hexIds, regionIds, edges, landmarks } = loadMapData();

  const [seasonPda] = findSeason(seasonId);
  const [countersPda] = findSeasonCounters(seasonId);

  // 1. Create season
  await program.methods
    .createSeason({
      landRushEnd,
      warStart,
      escalationStart,
      seasonEnd,
      joinCutoff,
      h3Resolution: 3,
      energyPerHexPerHour: 10,
      energyPerLandmarkPerHour: 20,
      energyCap: 500,
      startingEnergy: 100,
      claimCost: 10,
      minAttackEnergy: 20,
      baseAttackWindow: new BN(4 * 60),         // 4 min (short for testing)
      extendedAttackWindow: new BN(8 * 60),
      occupationShieldSeconds: new BN(60),
      defenderWinCooldownSeconds: new BN(60),
      captureCooldownSeconds: new BN(30),
      maxRespawnsPerSeason: 3,
      pointsPerHexPerHour: 10,
      pointsPerLandmarkPerHour: 20,
      victoryThreshold: new BN(50000),
      escalationEnergyMultiplierBps: 15000,
      escalationAttackCostMultiplierBps: 8000,
      escalationStage2Start: escalation2,
      escalationStage2EnergyMultiplierBps: 20000,
      escalationStage2AttackCostMultiplierBps: 6000,
      escalationStage2LandmarkMultiplierBps: 20000,
      theatreCaptureBonusPoints: 100,
      theatreDefenceBonusPoints: 50,
      captureBonusPoints: 25,
      attackRefundBps: 1000,
      attackRefundMinThresholdMultiplier: 3,
      retaliationDiscountBps: 2500,
      phantomRecoveryEnergy: 15,
      retaliationWindowSeconds: new BN(600),
      clutchDefenceBonusPoints: 50,
      clutchWindowSeconds: new BN(120),
      landmarks,
    })
    .accounts({
      admin: admin.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      seasonCounters: countersPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await delay(2000);
  console.log("  Season created.");

  // 2. Upload hex data in chunks
  const [vhsPda] = findValidHexSet(seasonId, 0);

  await program.methods
    .initValidHexes(0, hexIds.length)
    .accounts({
      admin: admin.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      validHexSet: vhsPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await delay(2000);
  console.log("  ValidHexSet initialized.");

  for (let offset = 0; offset < hexIds.length; offset += HEX_CHUNK_SIZE) {
    const chunk = hexIds.slice(offset, offset + HEX_CHUNK_SIZE);
    const regionChunk = regionIds.slice(offset, offset + HEX_CHUNK_SIZE);

    await program.methods
      .appendHexData(chunk, Buffer.from(regionChunk))
      .accounts({
        admin: admin.publicKey,
        globalConfig: globalConfigPda,
        season: seasonPda,
        validHexSet: vhsPda,
      })
      .rpc();
    await delay(1500);
    console.log(`  Appended hexes ${offset}..${offset + chunk.length - 1}`);
  }

  // 3. Upload adjacency data in chunks
  const [adjPda] = findAdjacencySet(seasonId, 0);

  await program.methods
    .initAdjacency(0, edges.length)
    .accounts({
      admin: admin.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      adjacencySet: adjPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await delay(2000);
  console.log("  AdjacencySet initialized.");

  for (let offset = 0; offset < edges.length; offset += EDGE_CHUNK_SIZE) {
    const chunk = edges.slice(offset, offset + EDGE_CHUNK_SIZE);

    await program.methods
      .appendAdjacencyData(chunk)
      .accounts({
        admin: admin.publicKey,
        globalConfig: globalConfigPda,
        season: seasonPda,
        adjacencySet: adjPda,
      })
      .rpc();
    await delay(1500);
    console.log(`  Appended edges ${offset}..${offset + chunk.length - 1}`);
  }

  // 4. Finalize
  await program.methods
    .finalizeMapData()
    .accounts({
      admin: admin.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      validHexSet: vhsPda,
      adjacencySet: adjPda,
    })
    .rpc();
  await delay(2000);

  console.log("\n=== Test Season Ready ===");
  console.log(`Season ID: ${seasonId.toString()}`);
  console.log(`Hexes: ${hexIds.length}`);
  console.log(`Edges: ${edges.length}`);
  console.log(`Land rush ends: ${new Date(landRushEnd.toNumber() * 1000).toISOString()}`);
  console.log(`War starts: ${new Date(warStart.toNumber() * 1000).toISOString()}`);
  console.log(`Season ends: ${new Date(seasonEnd.toNumber() * 1000).toISOString()}`);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
