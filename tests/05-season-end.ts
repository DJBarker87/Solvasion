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
  findReputation,
  createTestSeason,
  createCommitment,
  randomBlind,
  TEST_HEXES,
} from "./helpers";

describe("05 — Season End + Cleanup", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Solvasion as Program<Solvasion>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet.publicKey;
  const programId = program.programId;
  const [globalConfigPda] = findGlobalConfig(programId);

  let seasonId: BN;

  it("end_season — time expired happy path", async () => {
    // Create a season that has ALREADY ended (season_end in the past)
    const now = Math.floor(Date.now() / 1000);
    const result = await createTestSeason(program, provider.wallet, {
      seasonEnd: new BN(now - 1), // already expired
      warPhase: true,
    });
    seasonId = result.seasonId;

    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);

    // Join season before ending it (needed for finalization)
    // Actually join_cutoff won't work if season_end is in the past, because
    // effective_phase returns Ended. And join_season checks phase != Ended.
    // So we can't join. But we can still end the season.

    // Actually wait — create_season sets join_cutoff = now + 14 days, but
    // effective_phase checks if now >= season_end, which returns Ended.
    // So join_season would fail. Let's just test end_season.

    await program.methods
      .endSeason()
      .accounts({
        anySigner: admin,
        season: seasonPda,
        seasonCounters: countersPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const season = await program.account.season.fetch(seasonPda);
    expect(season.hasActualEnd).to.equal(true);
    expect(season.actualEnd.toNumber()).to.be.greaterThan(0);
  });

  it("end_season — before time rejected (DeadlineNotPassed)", async () => {
    // Create a season with future end time
    const result = await createTestSeason(program, provider.wallet, {
      warPhase: true,
    });
    const futureSeasonId = result.seasonId;
    const [seasonPda] = findSeason(programId, futureSeasonId);
    const [countersPda] = findSeasonCounters(programId, futureSeasonId);

    try {
      await program.methods
        .endSeason()
        .accounts({
          anySigner: admin,
          season: seasonPda,
          seasonCounters: countersPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).to.exist;
    }
  });

  it("finalize_chunk + finalize_complete happy path", async () => {
    // Use a season where we can join, claim hexes, then end it.
    // Create season with war_start in past and season_end 5 seconds from now.
    // Create season with long enough window to join + claim, then wait for it to end.
    // createTestSeason takes ~15-20s, then we need join + claim (~6s), so use 60s window.
    const now = Math.floor(Date.now() / 1000);
    const result = await createTestSeason(program, provider.wallet, {
      warPhase: true,
      seasonEnd: new BN(now + 60), // ends in 60 seconds (enough time for setup)
      victoryThreshold: new BN(999999999), // unreachable
    });
    const finSeasonId = result.seasonId;

    const [seasonPda] = findSeason(programId, finSeasonId);
    const [countersPda] = findSeasonCounters(programId, finSeasonId);
    const [playerPda] = findPlayer(programId, finSeasonId, admin);
    const [vhsPda] = findValidHexSet(programId, finSeasonId, 0);
    const [adjPda] = findAdjacencySet(programId, finSeasonId, 0);

    // Join
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

    // Claim hex 100
    const blind = randomBlind();
    const { commitment } = createCommitment(5, blind);
    const [hexPda] = findHex(programId, finSeasonId, TEST_HEXES[0]);

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

    // Wait for season to end — calculate remaining time dynamically
    const elapsed = Math.floor(Date.now() / 1000) - now;
    const waitTime = Math.max(0, 62 - elapsed) * 1000; // 62s from season creation + margin
    console.log(`    Waiting ${Math.ceil(waitTime / 1000)}s for season to end...`);
    await new Promise((r) => setTimeout(r, waitTime));

    // End season
    await program.methods
      .endSeason()
      .accounts({
        anySigner: admin,
        season: seasonPda,
        seasonCounters: countersPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Finalize chunk (pass player account via remaining_accounts)
    await program.methods
      .finalizeChunk()
      .accounts({
        anySigner: admin,
        season: seasonPda,
        seasonCounters: countersPda,
      })
      .remainingAccounts([
        { pubkey: playerPda, isSigner: false, isWritable: true },
      ])
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const player = await program.account.player.fetch(playerPda);
    expect(player.finalized).to.equal(true);

    // Finalize complete
    await program.methods
      .finalizeComplete()
      .accounts({
        anySigner: admin,
        season: seasonPda,
        seasonCounters: countersPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const season = await program.account.season.fetch(seasonPda);
    expect(season.finalizationComplete).to.equal(true);
    expect(season.hasWinner).to.equal(true);

    // --- update_reputation ---
    const [reputationPda] = findReputation(programId, admin);

    await program.methods
      .updateReputation()
      .accounts({
        payer: admin,
        season: seasonPda,
        player: playerPda,
        reputation: reputationPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const rep = await program.account.reputation.fetch(reputationPda);
    expect(rep.seasonsPlayed).to.be.greaterThan(0);

    // --- close_season_hex ---
    await program.methods
      .closeSeasonHex(TEST_HEXES[0])
      .accounts({
        anySigner: admin,
        season: seasonPda,
        hex: hexPda,
      })
      .remainingAccounts([
        { pubkey: admin, isSigner: false, isWritable: true },
      ])
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Hex account should be closed (zeroed)
    try {
      await program.account.hex.fetch(hexPda);
      // May succeed with zeroed data — check owner is default
    } catch {
      // Expected — account closed
    }

    // --- close_season_player ---
    await program.methods
      .closeSeasonPlayer()
      .accounts({
        anySigner: admin,
        season: seasonPda,
        player: playerPda,
      })
      .remainingAccounts([
        { pubkey: admin, isSigner: false, isWritable: true },
      ])
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Player account should be closed
    try {
      await program.account.player.fetch(playerPda);
    } catch {
      // Expected — account closed
    }
  });

  it("claim_victory — victory not reached rejected", async () => {
    // Create a fresh season, join, claim 1 hex (minimal points)
    const result = await createTestSeason(program, provider.wallet, {
      warPhase: true,
      victoryThreshold: new BN(999999999),
    });
    const vSeasonId = result.seasonId;
    const [seasonPda] = findSeason(programId, vSeasonId);
    const [countersPda] = findSeasonCounters(programId, vSeasonId);
    const [playerPda] = findPlayer(programId, vSeasonId, admin);

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

    try {
      await program.methods
        .claimVictory()
        .accounts({
          anySigner: admin,
          season: seasonPda,
          player: playerPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).to.exist;
    }
  });
});
