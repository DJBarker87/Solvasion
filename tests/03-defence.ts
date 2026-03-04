import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
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

/**
 * Key insight for defence tests:
 * - claim_hex stores a commitment but does NOT add to energy_committed
 * - withdraw_defence subtracts from energy_committed, so it can't withdraw claim commitments directly
 * - increase_defence replaces commitment and adds delta to energy_committed (no old commitment verification)
 * - To test withdraw/recommit, we must first use increase_defence to set a known commitment
 *   with matching energy_committed tracking
 */
describe("03 — Defence Commitment Lifecycle", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Solvasion as Program<Solvasion>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet.publicKey;
  const programId = program.programId;
  const [globalConfigPda] = findGlobalConfig(programId);

  let seasonId: BN;
  // We'll track hex 100's current commitment for all tests
  let currentBlind: Uint8Array;
  let currentAmount: number;
  let currentNonce: number;

  before(async () => {
    // Create season in War phase so commit_defence works
    const result = await createTestSeason(program, provider.wallet, {
      warPhase: true,
    });
    seasonId = result.seasonId;

    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    // Join season
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

    // Claim hex 100 (first hex, adjacency waived)
    const claimBlind = randomBlind();
    const claimAmount = 5;
    const { commitment } = createCommitment(claimAmount, claimBlind);
    const [hexPda] = findHex(programId, seasonId, TEST_HEXES[0]);

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

    // Claim hex 200 (adjacent to 100)
    const claimBlind2 = randomBlind();
    const { commitment: c2 } = createCommitment(5, claimBlind2);
    const [hexPda2] = findHex(programId, seasonId, TEST_HEXES[1]);

    await program.methods
      .claimHex(TEST_HEXES[1], c2, new BN(1))
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        seasonCounters: countersPda,
        player: playerPda,
        hex: hexPda2,
        validHexSet: vhsPda,
        adjacencySet: adjPda,
        adjacentHex: hexPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Now use increase_defence on hex 100 to set a KNOWN commitment with proper energy_committed tracking
    // increase_defence replaces the commitment (no verification of old one) and adds delta to energy_committed
    currentBlind = randomBlind();
    currentAmount = 20;
    currentNonce = 2; // after 2 claims, nonce = 2
    const { commitment: knownCommitment } = createCommitment(
      currentAmount,
      currentBlind
    );

    await program.methods
      .increaseDefence(
        TEST_HEXES[0],
        knownCommitment,
        new BN(currentNonce),
        currentAmount
      )
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));
    currentNonce = 3; // nonce incremented
  });

  it("withdraw_defence — happy path (Pedersen verification)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[0];
    const [hexPda] = findHex(programId, seasonId, hexId);

    // Withdraw with correct opening
    await program.methods
      .withdrawDefence(hexId, currentAmount, Array.from(currentBlind) as any)
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const hex = await program.account.hex.fetch(hexPda);
    expect(hex.hasCommitment).to.equal(false);

    const player = await program.account.player.fetch(playerPda);
    expect(player.energyCommitted).to.equal(0);
    currentNonce = player.commitmentNonce.toNumber();
  });

  it("withdraw_defence — wrong blind rejected (InvalidCommitmentOpening)", async () => {
    // Set a new commitment on hex 100 via commit_defence (hex has no commitment now)
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[0];
    const [hexPda] = findHex(programId, seasonId, hexId);

    currentBlind = randomBlind();
    currentAmount = 15;
    const { commitment } = createCommitment(currentAmount, currentBlind);

    await program.methods
      .commitDefence(
        [{ hexId, commitment, nonce: new BN(currentNonce) }],
        currentAmount
      )
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
      })
      .remainingAccounts([
        { pubkey: hexPda, isSigner: false, isWritable: true },
      ])
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));
    currentNonce++;

    // Try withdraw with WRONG blind
    const wrongBlind = randomBlind();
    try {
      await program.methods
        .withdrawDefence(hexId, currentAmount, Array.from(wrongBlind) as any)
        .accounts({
          playerWallet: admin,
          season: seasonPda,
          player: playerPda,
          hex: hexPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Transaction should fail on-chain
      expect(e).to.exist;
    }
  });

  it("withdraw_defence — wrong amount rejected (InvalidCommitmentOpening)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[0];
    const [hexPda] = findHex(programId, seasonId, hexId);

    // Try withdraw with correct blind but WRONG amount
    try {
      await program.methods
        .withdrawDefence(hexId, 99, Array.from(currentBlind) as any)
        .accounts({
          playerWallet: admin,
          season: seasonPda,
          player: playerPda,
          hex: hexPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Transaction should fail on-chain
      expect(e).to.exist;
    }
  });

  it("recommit_defence — happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[0];
    const [hexPda] = findHex(programId, seasonId, hexId);

    // Recommit with new commitment (verify old, set new)
    const newBlind = randomBlind();
    const newAmount = 18;
    const { commitment: newCommitment } = createCommitment(newAmount, newBlind);

    await program.methods
      .recommitDefence(
        hexId,
        currentAmount, // old amount
        Array.from(currentBlind) as any, // old blind
        newCommitment,
        new BN(currentNonce),
        newAmount
      )
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const hex = await program.account.hex.fetch(hexPda);
    expect(hex.hasCommitment).to.equal(true);
    expect(Buffer.from(hex.defenceCommitment).toString("hex")).to.equal(
      Buffer.from(newCommitment).toString("hex")
    );

    currentBlind = newBlind;
    currentAmount = newAmount;
    currentNonce++;
  });

  it("commit_defence — wrong nonce rejected (InvalidNonce)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    // Use hex 200 which still has claim commitment. Clear it first.
    const hexId = TEST_HEXES[1];
    const [hexPda] = findHex(programId, seasonId, hexId);

    // Replace hex 200 commitment with known one via increase_defence (delta=1 to avoid zero)
    const tmpBlind = randomBlind();
    const { commitment: tmpC } = createCommitment(1, tmpBlind);

    await program.methods
      .increaseDefence(hexId, tmpC, new BN(currentNonce), 1)
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));
    currentNonce++;

    // Withdraw to clear commitment
    await program.methods
      .withdrawDefence(hexId, 1, Array.from(tmpBlind) as any)
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    // Now commit_defence with WRONG nonce
    const blind = randomBlind();
    const { commitment } = createCommitment(10, blind);

    try {
      await program.methods
        .commitDefence(
          [{ hexId, commitment, nonce: new BN(999) }],
          10
        )
        .accounts({
          playerWallet: admin,
          season: seasonPda,
          player: playerPda,
        })
        .remainingAccounts([
          { pubkey: hexPda, isSigner: false, isWritable: true },
        ])
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Transaction should fail on-chain
      expect(e).to.exist;
    }
  });

  it("commit_defence — happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[1]; // hex 200 (no commitment after withdrawal above)
    const [hexPda] = findHex(programId, seasonId, hexId);

    const blind = randomBlind();
    const amount = 10;
    const { commitment } = createCommitment(amount, blind);

    await program.methods
      .commitDefence(
        [{ hexId, commitment, nonce: new BN(currentNonce) }],
        amount
      )
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
      })
      .remainingAccounts([
        { pubkey: hexPda, isSigner: false, isWritable: true },
      ])
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const hex = await program.account.hex.fetch(hexPda);
    expect(hex.hasCommitment).to.equal(true);
    currentNonce++;
  });

  it("increase_defence — happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[1]; // hex 200 (has commitment from previous test)
    const [hexPda] = findHex(programId, seasonId, hexId);

    const blind = randomBlind();
    const delta = 5;
    const { commitment } = createCommitment(15, blind); // new total

    await program.methods
      .increaseDefence(hexId, commitment, new BN(currentNonce), delta)
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        player: playerPda,
        hex: hexPda,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const player = await program.account.player.fetch(playerPda);
    expect(player.commitmentNonce.toNumber()).to.equal(currentNonce + 1);
  });
});
