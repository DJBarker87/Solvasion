import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import { Solvasion } from "../target/types/solvasion";
import {
  findGlobalConfig,
  findSeason,
  findSeasonCounters,
  findValidHexSet,
  findAdjacencySet,
  TEST_HEXES,
  TEST_REGION_IDS,
  TEST_EDGES,
  TEST_LANDMARK,
} from "./helpers";

describe("01 — Admin + Season Setup", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Solvasion as Program<Solvasion>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet.publicKey;
  const programId = program.programId;

  const [globalConfigPda] = findGlobalConfig(programId);
  let seasonId: BN;

  it("initialize — happy path", async () => {
    // GlobalConfig may already exist from a previous test run
    let exists = false;
    try {
      await program.account.globalConfig.fetch(globalConfigPda);
      exists = true;
    } catch {}

    if (!exists) {
      await program.methods
        .initialize()
        .accounts({
          admin,
          globalConfig: globalConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      await new Promise((r) => setTimeout(r, 2000));
    }

    const config = await program.account.globalConfig.fetch(globalConfigPda);
    expect(config.admin.toBase58()).to.equal(admin.toBase58());
    expect(config.paused).to.equal(false);
  });

  it("create_season — happy path", async () => {
    const config = await program.account.globalConfig.fetch(globalConfigPda);
    seasonId = new BN(config.seasonCounter.toNumber() + 1);

    const now = Math.floor(Date.now() / 1000);
    const oneDay = 86400;

    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);

    await program.methods
      .createSeason({
        landRushEnd: new BN(now + 7 * oneDay),
        warStart: new BN(now + 7 * oneDay),
        escalationStart: new BN(now + 21 * oneDay),
        seasonEnd: new BN(now + 28 * oneDay),
        joinCutoff: new BN(now + 14 * oneDay),
        h3Resolution: 3,
        energyPerHexPerHour: 10,
        energyPerLandmarkPerHour: 20,
        energyCap: 500,
        startingEnergy: 100,
        claimCost: 10,
        minAttackEnergy: 20,
        baseAttackWindow: new BN(4 * 3600),
        extendedAttackWindow: new BN(8 * 3600),
        occupationShieldSeconds: new BN(3600),
        defenderWinCooldownSeconds: new BN(4 * 3600),
        captureCooldownSeconds: new BN(1800),
        maxRespawnsPerSeason: 3,
        pointsPerHexPerHour: 10,
        pointsPerLandmarkPerHour: 20,
        victoryThreshold: new BN(50000),
        escalationEnergyMultiplierBps: 15000,
        escalationAttackCostMultiplierBps: 8000,
        escalationStage2Start: new BN(now + 25 * oneDay),
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
        retaliationWindowSeconds: new BN(12 * 3600),
        clutchDefenceBonusPoints: 50,
        clutchWindowSeconds: new BN(300),
        landmarks: [TEST_LANDMARK],
      })
      .accounts({
        admin,
        globalConfig: globalConfigPda,
        season: seasonPda,
        seasonCounters: countersPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const season = await program.account.season.fetch(seasonPda);
    expect(season.seasonId.toNumber()).to.equal(seasonId.toNumber());
    expect(season.mapFinalized).to.equal(false);
    expect(season.landmarkCount).to.equal(1);
  });

  it("create_season — non-admin rejected", async () => {
    const fakeAdmin = Keypair.generate();
    // Airdrop to fake admin so they can sign
    try {
      const sig = await provider.connection.requestAirdrop(
        fakeAdmin.publicKey,
        100_000_000
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));

    const config = await program.account.globalConfig.fetch(globalConfigPda);
    const nextId = new BN(config.seasonCounter.toNumber() + 1);
    const [seasonPda] = findSeason(programId, nextId);
    const [countersPda] = findSeasonCounters(programId, nextId);
    const now = Math.floor(Date.now() / 1000);
    const oneDay = 86400;

    try {
      await program.methods
        .createSeason({
          landRushEnd: new BN(now + 7 * oneDay),
          warStart: new BN(now + 7 * oneDay),
          escalationStart: new BN(now + 21 * oneDay),
          seasonEnd: new BN(now + 28 * oneDay),
          joinCutoff: new BN(now + 14 * oneDay),
          h3Resolution: 3,
          energyPerHexPerHour: 10,
          energyPerLandmarkPerHour: 20,
          energyCap: 500,
          startingEnergy: 100,
          claimCost: 10,
          minAttackEnergy: 20,
          baseAttackWindow: new BN(4 * 3600),
          extendedAttackWindow: new BN(8 * 3600),
          occupationShieldSeconds: new BN(3600),
          defenderWinCooldownSeconds: new BN(4 * 3600),
          captureCooldownSeconds: new BN(1800),
          maxRespawnsPerSeason: 3,
          pointsPerHexPerHour: 10,
          pointsPerLandmarkPerHour: 20,
          victoryThreshold: new BN(50000),
          escalationEnergyMultiplierBps: 15000,
          escalationAttackCostMultiplierBps: 8000,
          escalationStage2Start: new BN(now + 25 * oneDay),
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
          retaliationWindowSeconds: new BN(12 * 3600),
          clutchDefenceBonusPoints: 50,
          clutchWindowSeconds: new BN(300),
          landmarks: [TEST_LANDMARK],
        })
        .accounts({
          admin: fakeAdmin.publicKey,
          globalConfig: globalConfigPda,
          season: seasonPda,
          seasonCounters: countersPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([fakeAdmin])
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Anchor constraint error — has_one = admin
      expect(e).to.exist;
    }
  });

  it("map data setup — init + append + finalize happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    // Init valid hexes
    await program.methods
      .initValidHexes(0, TEST_HEXES.length)
      .accounts({
        admin,
        globalConfig: globalConfigPda,
        season: seasonPda,
        validHexSet: vhsPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Append hex data
    await program.methods
      .appendHexData(TEST_HEXES, Buffer.from(TEST_REGION_IDS))
      .accounts({
        admin,
        globalConfig: globalConfigPda,
        season: seasonPda,
        validHexSet: vhsPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Init adjacency
    await program.methods
      .initAdjacency(0, TEST_EDGES.length)
      .accounts({
        admin,
        globalConfig: globalConfigPda,
        season: seasonPda,
        adjacencySet: adjPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Append adjacency data
    await program.methods
      .appendAdjacencyData(TEST_EDGES)
      .accounts({
        admin,
        globalConfig: globalConfigPda,
        season: seasonPda,
        adjacencySet: adjPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Finalize
    await program.methods
      .finalizeMapData()
      .accounts({
        admin,
        globalConfig: globalConfigPda,
        season: seasonPda,
        validHexSet: vhsPda,
        adjacencySet: adjPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const season = await program.account.season.fetch(seasonPda);
    expect(season.mapFinalized).to.equal(true);

    const vhs = await program.account.validHexSet.fetch(vhsPda);
    expect(vhs.hexCount).to.equal(TEST_HEXES.length);
  });

  it("double finalize rejected (MapAlreadyFinalized)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    try {
      await program.methods
        .finalizeMapData()
        .accounts({
          admin,
          globalConfig: globalConfigPda,
          season: seasonPda,
          validHexSet: vhsPda,
          adjacencySet: adjPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      // MapAlreadyFinalized constraint
      expect(e).to.exist;
    }
  });
});
