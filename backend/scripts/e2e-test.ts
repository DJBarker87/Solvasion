#!/usr/bin/env npx tsx
/**
 * E2E integration test for Solvasion backend.
 * Run: npx tsx backend/scripts/e2e-test.ts
 *
 * Prerequisites:
 * - Solvasion program deployed on devnet
 * - Crank wallet funded (~0.5 SOL)
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Keypair, PublicKey, SystemProgram,
  sendAndConfirmTransaction, Transaction,
} from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Project imports
import { config } from "../src/config.js";
import { initDb, getDb, preparedStatements } from "../src/db.js";
import { getConnection, getCrankKeypair, idl } from "../src/solana.js";
import { startIndexer, stopIndexer } from "../src/indexer/index.js";
import { startGuardian } from "../src/guardian/index.js";
import { createCommitment, randomBlind } from "../src/utils/pedersen.js";
import {
  findGlobalConfig, findSeason, findSeasonCounters,
  findPlayer, findHex, findAttack,
} from "../src/utils/pda.js";

// ---- Test configuration ----
const TEST_DB_PATH = path.resolve(import.meta.dirname, "../db/solvasion-e2e-test.sqlite");

// Test hex IDs (same as test suite)
const TEST_HEXES = [new BN(100), new BN(200), new BN(300), new BN(400), new BN(500)];
const TEST_EDGES: [BN, BN][] = [
  [new BN(100), new BN(200)],
  [new BN(200), new BN(300)],
  [new BN(300), new BN(400)],
  [new BN(400), new BN(500)],
];
const TEST_LANDMARK = new BN(300);

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  \u2713 ${msg}`);
    passed++;
  } else {
    console.log(`  \u2717 ${msg}`);
    failed++;
  }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log("=== Solvasion E2E Test ===\n");

  // Override DB path for test isolation
  (config as any).dbPath = TEST_DB_PATH;

  // Clean up test DB if it exists
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

  // ---- Step 1: Create test season on devnet ----
  console.log("Step 1: Creating test season...");

  const conn = getConnection();
  const crankKp = getCrankKeypair();
  const crankWallet = new anchor.Wallet(crankKp);
  const provider = new anchor.AnchorProvider(conn, crankWallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  const program = new Program(idl, provider);
  const programId = config.programId;

  const { seasonId, seasonPda, vhsPda, adjPda } = await createTestSeason(program, provider, programId);
  console.log(`  Season ${seasonId.toString()} created\n`);

  // ---- Step 2: Init DB + start indexer ----
  console.log("Step 2: Starting indexer...");
  initDb(true);
  startIndexer();
  await delay(2000);
  console.log("  Indexer started\n");

  // ---- Step 3: Player joins + claims + defends ----
  console.log("Step 3: Player actions...");

  const playerKp = Keypair.generate();
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: crankKp.publicKey,
      toPubkey: playerKp.publicKey,
      lamports: 200_000_000,
    })
  );
  await sendAndConfirmTransaction(conn, fundTx, [crankKp], { commitment: "confirmed" });

  const playerWallet = new anchor.Wallet(playerKp);
  const playerProvider = new anchor.AnchorProvider(conn, playerWallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  const playerProgram = new Program(idl, playerProvider);

  // Join season
  const [countersPda] = findSeasonCounters(programId, seasonId);
  const [playerPda] = findPlayer(programId, seasonId, playerKp.publicKey);

  await playerProgram.methods
    .joinSeason()
    .accounts({
      playerWallet: playerKp.publicKey,
      season: seasonPda,
      seasonCounters: countersPda,
      player: playerPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);
  console.log(`  Player joined: ${playerKp.publicKey.toBase58().slice(0, 8)}...`);

  let playerNonce = 0;

  // Claim hex 100 (first claim — no adjacency proof needed, but account still required)
  const blind100 = randomBlind();
  const { commitment: commit100 } = createCommitment(15, blind100);
  const [hex100Pda] = findHex(programId, seasonId, new BN(100));

  await playerProgram.methods
    .claimHex(new BN(100), commit100, new BN(playerNonce))
    .accounts({
      playerWallet: playerKp.publicKey,
      season: seasonPda,
      seasonCounters: countersPda,
      player: playerPda,
      hex: hex100Pda,
      validHexSet: vhsPda,
      adjacencySet: adjPda,
      adjacentHex: null,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);
  playerNonce++;
  console.log("  Claimed hex 100");

  // Claim hex 200 (adjacent to 100)
  const blind200 = randomBlind();
  const { commitment: commit200 } = createCommitment(5, blind200);
  const [hex200Pda] = findHex(programId, seasonId, new BN(200));

  await playerProgram.methods
    .claimHex(new BN(200), commit200, new BN(playerNonce))
    .accounts({
      playerWallet: playerKp.publicKey,
      season: seasonPda,
      seasonCounters: countersPda,
      player: playerPda,
      hex: hex200Pda,
      validHexSet: vhsPda,
      adjacencySet: adjPda,
      adjacentHex: hex100Pda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);
  playerNonce++;
  console.log("  Claimed hex 200");

  // Commit tracked defence on hex 200 via increase_defence
  const blind200Tracked = randomBlind();
  const trackedEnergy = 20;
  const { commitment: trackedCommit } = createCommitment(trackedEnergy, blind200Tracked);

  await playerProgram.methods
    .increaseDefence(new BN(200), trackedCommit, new BN(playerNonce), trackedEnergy)
    .accounts({
      playerWallet: playerKp.publicKey,
      season: seasonPda,
      player: playerPda,
      hex: hex200Pda,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);
  playerNonce++;
  console.log(`  Defence committed on hex 200 (${trackedEnergy} energy)`);

  // Wait for indexer to process events
  await delay(3000);

  // Verify DB state
  const db = getDb();
  const stmts = preparedStatements(db);
  const dbPlayer = stmts.getPlayer.get(seasonId.toNumber(), playerKp.publicKey.toBase58()) as any;
  assert(!!dbPlayer, "Player exists in DB");
  assert(dbPlayer?.hex_count >= 2, "Player has 2+ hexes in DB");
  console.log();

  // ---- Step 4: Set guardian ----
  console.log("Step 4: Guardian setup...");

  const guardianKp = Keypair.generate();
  const fundGuardianTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: crankKp.publicKey,
      toPubkey: guardianKp.publicKey,
      lamports: 100_000_000,
    })
  );
  await sendAndConfirmTransaction(conn, fundGuardianTx, [crankKp], { commitment: "confirmed" });

  // Set guardian on-chain
  await playerProgram.methods
    .setGuardian(guardianKp.publicKey)
    .accounts({
      playerWallet: playerKp.publicKey,
      season: seasonPda,
      player: playerPda,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);
  console.log(`  Guardian set to ${guardianKp.publicKey.toBase58().slice(0, 8)}...`);

  // Set up guardian service with test keys
  const testMasterKey = crypto.randomBytes(32);
  (config as any).guardianMasterKey = testMasterKey.toString("hex");

  const guardianKeyPath = path.resolve(import.meta.dirname, "../db/test-guardian-key.json");
  fs.writeFileSync(guardianKeyPath, JSON.stringify(Array.from(guardianKp.secretKey)));
  (config as any).guardianKeypairPath = guardianKeyPath;

  const guardianStarted = startGuardian();
  assert(guardianStarted, "Guardian service started");

  // ---- Step 5: Upload reveal packet ----
  console.log("\nStep 5: Upload guardian packet...");

  const { encryptPacket } = await import("../src/guardian/crypto.js");
  const { encrypted, iv, authTag } = encryptPacket(
    { energy_amount: trackedEnergy, blind_hex: Buffer.from(blind200Tracked).toString("hex"), nonce: 0 },
    testMasterKey
  );

  stmts.upsertGuardianPacket.run({
    season_id: seasonId.toNumber(),
    player_wallet: playerKp.publicKey.toBase58(),
    hex_id: "200",
    encrypted_blob: encrypted,
    iv,
    auth_tag: authTag,
    nonce: 0,
    created_at: Math.floor(Date.now() / 1000),
  });

  const storedPacket = stmts.getGuardianPacket.get(
    seasonId.toNumber(), playerKp.publicKey.toBase58(), "200"
  );
  assert(!!storedPacket, "Guardian packet stored in DB");
  console.log();

  // ---- Step 6: Attacker joins + claims + attacks ----
  console.log("Step 6: Attack scenario...");

  const attackerKp = Keypair.generate();
  const fundAttackerTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: crankKp.publicKey,
      toPubkey: attackerKp.publicKey,
      lamports: 200_000_000,
    })
  );
  await sendAndConfirmTransaction(conn, fundAttackerTx, [crankKp], { commitment: "confirmed" });

  const attackerWallet = new anchor.Wallet(attackerKp);
  const attackerProvider = new anchor.AnchorProvider(conn, attackerWallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });
  const attackerProgram = new Program(idl, attackerProvider);

  // Attacker joins
  const [attackerPlayerPda] = findPlayer(programId, seasonId, attackerKp.publicKey);
  await attackerProgram.methods
    .joinSeason()
    .accounts({
      playerWallet: attackerKp.publicKey,
      season: seasonPda,
      seasonCounters: countersPda,
      player: attackerPlayerPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);
  console.log(`  Attacker joined: ${attackerKp.publicKey.toBase58().slice(0, 8)}...`);

  // Attacker claims hex 300 (adjacent to 200)
  const blindAtk = randomBlind();
  const { commitment: commitAtk } = createCommitment(5, blindAtk);
  const [hex300Pda] = findHex(programId, seasonId, new BN(300));

  await attackerProgram.methods
    .claimHex(new BN(300), commitAtk, new BN(0))
    .accounts({
      playerWallet: attackerKp.publicKey,
      season: seasonPda,
      seasonCounters: countersPda,
      player: attackerPlayerPda,
      hex: hex300Pda,
      validHexSet: vhsPda,
      adjacencySet: adjPda,
      adjacentHex: null,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);
  console.log("  Attacker claimed hex 300");

  // Launch attack on hex 200
  const countersAccount = await (program.account as any).seasonCounters.fetch(countersPda);
  const attackId = new BN(countersAccount.nextAttackId);
  const [attackPda] = findAttack(programId, seasonId, attackId);

  const attackEnergy = 30;
  await attackerProgram.methods
    .launchAttack(new BN(200), new BN(300), attackEnergy, 0)
    .accounts({
      playerWallet: attackerKp.publicKey,
      season: seasonPda,
      seasonCounters: countersPda,
      playerAttacker: attackerPlayerPda,
      playerDefender: playerPda,
      hexTarget: hex200Pda,
      hexOrigin: hex300Pda,
      adjacencySet: adjPda,
      attack: attackPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  console.log(`  Attack launched on hex 200 (ID: ${attackId.toString()}, energy: ${attackEnergy})`);

  // ---- Step 7: Wait for guardian auto-reveal ----
  console.log("\nStep 7: Waiting for guardian auto-reveal...");

  // Give indexer time to pick up the event + guardian to submit reveal
  await delay(10000);

  // Check if attack was resolved
  const dbAttack = stmts.getAttack.get(seasonId.toNumber(), attackId.toNumber()) as any;
  assert(!!dbAttack, "Attack exists in DB");
  if (dbAttack) {
    assert(dbAttack.resolved === 1, "Attack is resolved");
    assert(dbAttack.result !== null, `Attack result: ${dbAttack.result}`);
    console.log(`  Guardian reveal flag: ${dbAttack.guardian_reveal}`);
  }

  // Check guardian packet was deleted (consumed)
  const deletedPacket = stmts.getGuardianPacket.get(
    seasonId.toNumber(), playerKp.publicKey.toBase58(), "200"
  );
  assert(!deletedPacket, "Guardian packet deleted after reveal");
  console.log();

  // ---- Step 8: Verify DB state ----
  console.log("Step 8: Verify DB state...");
  const dbAttacks = stmts.getSeasonAttacks.all(seasonId.toNumber(), 10) as any[];
  assert(dbAttacks.length >= 1, `${dbAttacks.length} attack(s) in DB`);

  const warFeed = stmts.getWarFeedLatest.all(seasonId.toNumber(), 20) as any[];
  assert(warFeed.length >= 3, `${warFeed.length} war feed entries`);
  console.log();

  // ---- Summary ----
  console.log("=== Results ===");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log();

  // Cleanup
  stopIndexer();
  if (fs.existsSync(guardianKeyPath)) fs.unlinkSync(guardianKeyPath);
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

  process.exit(failed > 0 ? 1 : 0);
}

// ---- Season creation (adapted from tests/helpers.ts) ----

async function createTestSeason(
  program: Program,
  provider: anchor.AnchorProvider,
  programId: PublicKey
): Promise<{ seasonId: BN; seasonPda: PublicKey; vhsPda: PublicKey; adjPda: PublicKey }> {
  const [globalConfigPda] = findGlobalConfig(programId);

  let globalConfig: any;
  try {
    globalConfig = await (program.account as any).globalConfig.fetch(globalConfigPda);
  } catch {
    await program.methods
      .initialize()
      .accounts({
        admin: provider.wallet.publicKey,
        globalConfig: globalConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await delay(2000);
    globalConfig = await (program.account as any).globalConfig.fetch(globalConfigPda);
  }

  const seasonId = new BN(globalConfig.seasonCounter.toNumber() + 1);
  const now = Math.floor(Date.now() / 1000);

  const seasonEnd = new BN(now + 120); // 2-minute season
  const [seasonPda] = findSeason(programId, seasonId);
  const [countersPda] = findSeasonCounters(programId, seasonId);

  await program.methods
    .createSeason({
      landRushEnd: new BN(now - 1),
      warStart: new BN(now - 1),
      escalationStart: new BN(now + 90),
      seasonEnd,
      joinCutoff: new BN(now + 60),
      h3Resolution: 3,
      energyPerHexPerHour: 10,
      energyPerLandmarkPerHour: 20,
      energyCap: 500,
      startingEnergy: 100,
      claimCost: 10,
      minAttackEnergy: 20,
      baseAttackWindow: new BN(300),
      extendedAttackWindow: new BN(600),
      occupationShieldSeconds: new BN(1),
      defenderWinCooldownSeconds: new BN(1),
      captureCooldownSeconds: new BN(1),
      maxRespawnsPerSeason: 3,
      pointsPerHexPerHour: 10,
      pointsPerLandmarkPerHour: 20,
      victoryThreshold: new BN(50000),
      escalationEnergyMultiplierBps: 15000,
      escalationAttackCostMultiplierBps: 8000,
      escalationStage2Start: new BN(now + 100),
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
      retaliationWindowSeconds: new BN(3600),
      clutchDefenceBonusPoints: 50,
      clutchWindowSeconds: new BN(300),
      landmarks: [TEST_LANDMARK],
    })
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      seasonCounters: countersPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);

  // Init + append valid hexes
  const [vhsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("valid_hexes"), seasonId.toArrayLike(Buffer, "le", 8), Buffer.from([0])],
    programId
  );
  await program.methods
    .initValidHexes(0, TEST_HEXES.length)
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      validHexSet: vhsPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);

  await program.methods
    .appendHexData(TEST_HEXES, Buffer.from([1, 1, 1, 1, 1]))
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      validHexSet: vhsPda,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);

  // Init + append adjacency
  const [adjPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("adjacency"), seasonId.toArrayLike(Buffer, "le", 8), Buffer.from([0])],
    programId
  );
  await program.methods
    .initAdjacency(0, TEST_EDGES.length)
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      adjacencySet: adjPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);

  await program.methods
    .appendAdjacencyData(TEST_EDGES)
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      adjacencySet: adjPda,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);

  // Finalize map
  await program.methods
    .finalizeMapData()
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      validHexSet: vhsPda,
      adjacencySet: adjPda,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await delay(2000);

  return { seasonId, seasonPda, vhsPda, adjPda };
}

main().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
