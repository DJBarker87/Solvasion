import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { expect } from "chai";
import { Solvasion } from "../target/types/solvasion";
import {
  findGlobalConfig,
  findSeason,
  findSeasonCounters,
  findPlayer,
  findHex,
  findValidHexSet,
  findAdjacencySet,
  createTestSeason,
  createCommitment,
  randomBlind,
  TEST_HEXES,
} from "./helpers";

describe("06 — Misc Instructions", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Solvasion as Program<Solvasion>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet.publicKey;
  const programId = program.programId;
  const [globalConfigPda] = findGlobalConfig(programId);

  let seasonId: BN;

  before(async () => {
    const result = await createTestSeason(program, provider.wallet, {
      warPhase: true,
    });
    seasonId = result.seasonId;

    // Join
    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);

    await program.methods
      .joinSeason()
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        seasonCounters: countersPda,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Claim hex 100 (first hex)
    const blind = randomBlind();
    const { commitment } = createCommitment(5, blind);
    const [hexPda] = findHex(programId, seasonId, TEST_HEXES[0]);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    await program.methods
      .claimHex(TEST_HEXES[0], commitment, new BN(0))
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        seasonCounters: countersPda,
        player: playerPda,
        hex: hexPda,
        validHexSet: vhsPda,
        adjacencySet: adjPda,
        adjacentHex: null,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));
  });

  it("set_shield — happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);

    await program.methods
      .setShield(8)
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const player = await program.account.player.fetch(playerPda);
    expect(player.pendingShieldHour).to.equal(8);
    expect(player.hasShieldChange).to.equal(true);
  });

  it("set_shield — invalid hour rejected (InvalidShieldHour)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);

    try {
      await program.methods
        .setShield(25) // > 23
        .accounts({
          playerWallet: admin,
          season: seasonPda,
          player: playerPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).to.exist;
    }
  });

  it("set_posture — happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);

    // Posture type 1 = Fortifying, target = hex 100
    await program.methods
      .setPosture(1, TEST_HEXES[0], null)
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const player = await program.account.player.fetch(playerPda);
    expect(player.postureType).to.equal(1);
    expect(player.hasPostureExpires).to.equal(true);
  });

  it("set_guardian + clear_guardian — happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const guardian = Keypair.generate();

    // Set guardian
    await program.methods
      .setGuardian(guardian.publicKey)
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    let player = await program.account.player.fetch(playerPda);
    expect(player.hasGuardian).to.equal(true);
    expect(player.guardian.toBase58()).to.equal(guardian.publicKey.toBase58());

    // Clear guardian
    await program.methods
      .clearGuardian()
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    player = await program.account.player.fetch(playerPda);
    expect(player.hasGuardian).to.equal(false);
  });

  it("set_active_theatres — happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const now = Math.floor(Date.now() / 1000);

    await program.methods
      .setActiveTheatres([1, 2, 3], new BN(now + 3600))
      .accounts({
        admin,
        season: seasonPda,
        globalConfig: globalConfigPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const season = await program.account.season.fetch(seasonPda);
    expect(season.activeTheatres[0]).to.equal(1);
    expect(season.activeTheatres[1]).to.equal(2);
    expect(season.activeTheatres[2]).to.equal(3);
    expect(season.theatreWindowIndex).to.equal(1);
  });

  it("set_active_theatres — invalid region rejected", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const now = Math.floor(Date.now() / 1000);

    try {
      await program.methods
        .setActiveTheatres([0, 0, 0], new BN(now + 3600)) // region 0 is invalid
        .accounts({
          admin,
          season: seasonPda,
          globalConfig: globalConfigPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).to.exist;
    }
  });
});
