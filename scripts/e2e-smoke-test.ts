#!/usr/bin/env npx tsx
/**
 * E2E smoke test: exercises the full Solana program → backend pipeline.
 *
 * Prerequisites:
 *   1. A test season created via setup-test-season.ts
 *   2. Backend running at http://localhost:3001
 *
 * Usage: npx tsx scripts/e2e-smoke-test.ts <season_id>
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, Connection } from "@solana/web3.js";
import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROGRAM_ID = new PublicKey("98VnxqEX7SBwLGJVAVeLSfQPEUDGwBEpQWwugvjPeAfM");
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const API_URL = process.env.API_URL ?? "http://localhost:3001";

// ---- Crypto helpers ----

const RistPoint = ristretto255.Point;
const H = ristretto255_hasher.hashToCurve(utf8ToBytes("Solvasion:DefenceCommitment:H:v1"));

function randomBlind(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  bytes[31] &= 0x0f;
  return bytes;
}

function createCommitment(amount: number, blind: Uint8Array): number[] {
  let blindBigInt = BigInt(0);
  for (let i = 0; i < 32; i++) {
    blindBigInt += BigInt(blind[i]) << BigInt(8 * i);
  }
  let C: InstanceType<typeof RistPoint>;
  if (amount === 0) {
    C = H.multiply(blindBigInt);
  } else if (blindBigInt === BigInt(0)) {
    C = RistPoint.BASE.multiply(BigInt(amount));
  } else {
    C = RistPoint.BASE.multiply(BigInt(amount)).add(H.multiply(blindBigInt));
  }
  return Array.from(C.toBytes());
}

// ---- PDA helpers ----

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
function findPlayer(seasonId: BN, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), seasonId.toArrayLike(Buffer, "le", 8), wallet.toBuffer()],
    PROGRAM_ID,
  );
}
function findHex(seasonId: BN, hexId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("hex"), seasonId.toArrayLike(Buffer, "le", 8), new BN(hexId).toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID,
  );
}
function findValidHexSet(seasonId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("valid_hexes"), seasonId.toArrayLike(Buffer, "le", 8), Buffer.from([0])],
    PROGRAM_ID,
  );
}
function findAdjacencySet(seasonId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("adjacency"), seasonId.toArrayLike(Buffer, "le", 8), Buffer.from([0])],
    PROGRAM_ID,
  );
}

// ---- REST helpers ----

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

// ---- Test runner ----

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function delay(ms: number) {
  await new Promise(r => setTimeout(r, ms));
}

// ---- Main ----

async function main() {
  const seasonIdArg = process.argv[2];
  if (!seasonIdArg) {
    console.error("Usage: npx tsx scripts/e2e-smoke-test.ts <season_id>");
    process.exit(1);
  }
  const seasonIdNum = parseInt(seasonIdArg, 10);
  const seasonId = new BN(seasonIdNum);

  // Load wallet
  const walletPath = process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;
  const secretKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  const player = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  const wallet = player.publicKey;

  console.log(`Player: ${wallet.toBase58()}`);
  console.log(`Season: ${seasonIdNum}`);
  console.log(`API: ${API_URL}\n`);

  // Set up Anchor
  const connection = new Connection(RPC_URL, "confirmed");
  const anchorWallet = new anchor.Wallet(player);
  const provider = new anchor.AnchorProvider(connection, anchorWallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  anchor.setProvider(provider);

  const idlPath = path.join(__dirname, "../target/idl/solvasion.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, provider);

  // Load map to get hex IDs and adjacency
  const mapDataPath = path.join(__dirname, "output/map-data-western.json");
  const mapData = JSON.parse(fs.readFileSync(mapDataPath, "utf-8"));
  const allHexIds: string[] = mapData.hex_ids;
  const edges: string[][] = mapData.adjacency_edges;

  // Build adjacency lookup
  const neighbors = new Map<string, string[]>();
  for (const [a, b] of edges) {
    if (!neighbors.has(a)) neighbors.set(a, []);
    if (!neighbors.has(b)) neighbors.set(b, []);
    neighbors.get(a)!.push(b);
    neighbors.get(b)!.push(a);
  }

  // Pick 3 connected hexes: start from hex[0], BFS for 2 neighbors
  const hexesToClaim: string[] = [allHexIds[0]];
  const visited = new Set([allHexIds[0]]);
  for (const hex of hexesToClaim) {
    if (hexesToClaim.length >= 3) break;
    for (const nb of neighbors.get(hex) ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        hexesToClaim.push(nb);
        if (hexesToClaim.length >= 3) break;
      }
    }
  }

  console.log("=== Step 1: Join Season ===");
  try {
    const [seasonPda] = findSeason(seasonId);
    const [countersPda] = findSeasonCounters(seasonId);
    const [playerPda] = findPlayer(seasonId, wallet);

    await program.methods
      .joinSeason()
      .accounts({
        playerWallet: wallet,
        season: seasonPda,
        seasonCounters: countersPda,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await delay(2000);
    check("Join season", true);
  } catch (err: any) {
    if (err.message?.includes("already in use")) {
      check("Join season (already joined)", true);
    } else {
      check("Join season", false, err.message);
    }
  }

  console.log("\n=== Step 2: Claim 3 Hexes ===");
  const [vhsPda] = findValidHexSet(seasonId);
  const [adjPda] = findAdjacencySet(seasonId);
  let nonce = 1;

  for (let i = 0; i < hexesToClaim.length; i++) {
    const hexId = hexesToClaim[i];
    try {
      const [seasonPda] = findSeason(seasonId);
      const [countersPda] = findSeasonCounters(seasonId);
      const [playerPda] = findPlayer(seasonId, wallet);
      const [hexPda] = findHex(seasonId, hexId);

      // Find an already-claimed hex that is adjacent to this one
      const claimed = hexesToClaim.slice(0, i);
      const adjHexId = claimed.find(c => (neighbors.get(c) ?? []).includes(hexId));
      const adjacentHexPda = i === 0
        ? program.programId
        : findHex(seasonId, adjHexId!)[0];

      const blind = randomBlind();
      const commitment = createCommitment(0, blind);

      await program.methods
        .claimHex(new BN(hexId), commitment, new BN(nonce++))
        .accounts({
          playerWallet: wallet,
          season: seasonPda,
          seasonCounters: countersPda,
          player: playerPda,
          hex: hexPda,
          validHexSet: vhsPda,
          adjacencySet: adjPda,
          adjacentHex: adjacentHexPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      await delay(2000);
      check(`Claim hex ${hexId}`, true);
    } catch (err: any) {
      if (err.message?.includes("already in use")) {
        check(`Claim hex ${hexId} (already claimed)`, true);
      } else {
        check(`Claim hex ${hexId}`, false, err.message);
      }
    }
  }

  console.log("\n=== Step 3: Defence Actions ===");

  // Commit defence on hex 0 via increase_defence (since claim doesn't track in energy_committed)
  const defHex0 = hexesToClaim[0];
  try {
    const [seasonPda] = findSeason(seasonId);
    const [playerPda] = findPlayer(seasonId, wallet);
    const [hexPda] = findHex(seasonId, defHex0);

    const blind = randomBlind();
    const commitment = createCommitment(15, blind);

    await program.methods
      .increaseDefence(new BN(defHex0), commitment, new BN(nonce++), 15)
      .accounts({
        playerWallet: wallet,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc();
    await delay(2000);
    check(`Increase defence on hex ${defHex0} (15 energy)`, true);
  } catch (err: any) {
    check(`Increase defence on hex ${defHex0}`, false, err.message);
  }

  // Increase defence on hex 1
  const defHex1 = hexesToClaim[1];
  try {
    const [seasonPda] = findSeason(seasonId);
    const [playerPda] = findPlayer(seasonId, wallet);
    const [hexPda] = findHex(seasonId, defHex1);

    const blind = randomBlind();
    const commitment = createCommitment(10, blind);

    await program.methods
      .increaseDefence(new BN(defHex1), commitment, new BN(nonce++), 10)
      .accounts({
        playerWallet: wallet,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc();
    await delay(2000);
    check(`Increase defence on hex ${defHex1} (10 energy)`, true);
  } catch (err: any) {
    check(`Increase defence on hex ${defHex1}`, false, err.message);
  }

  console.log("\n=== Step 4: Wait for Backend Indexing ===");
  console.log("  Waiting 5s for backend to index events...");
  await delay(5000);

  console.log("\n=== Step 5: Verify Backend State ===");

  // Check map
  try {
    const data = await apiGet(`/api/seasons/${seasonIdNum}/map`);
    const hexes = data.hexes as Array<{ hex_id: string; owner: string | null }>;
    const claimedByUs = hexes.filter(
      (h) => hexesToClaim.includes(h.hex_id) && h.owner === wallet.toBase58(),
    );
    check(`Map: ${claimedByUs.length}/3 hexes show correct owner`, claimedByUs.length === 3);

    // Check commitment flags
    const withCommitment = hexes.filter(
      (h) => (h.hex_id === defHex0 || h.hex_id === defHex1) && (h as any).has_commitment === 1,
    );
    check(`Map: ${withCommitment.length}/2 hexes show commitment`, withCommitment.length === 2);
  } catch (err: any) {
    check("Map endpoint", false, err.message);
  }

  // Check player
  try {
    const data = await apiGet(`/api/seasons/${seasonIdNum}/players/${wallet.toBase58()}`);
    const p = data.player;
    check(`Player hex_count >= 3`, p.hex_count >= 3, `got ${p.hex_count}`);
    check(`Player energy_balance < 100`, p.energy_balance < 100, `got ${p.energy_balance}`);
  } catch (err: any) {
    check("Player endpoint", false, err.message);
  }

  // Check feed
  try {
    const data = await apiGet(`/api/seasons/${seasonIdNum}/feed?limit=50`);
    const feed = data.feed as Array<{ event_type: string }>;
    const claimEvents = feed.filter((f) => f.event_type === "HexClaimed");
    check(`Feed: ${claimEvents.length} HexClaimed events (>= 3 expected)`, claimEvents.length >= 3);
  } catch (err: any) {
    check("Feed endpoint", false, err.message);
  }

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
