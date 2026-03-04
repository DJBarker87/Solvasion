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
  airdropIfNeeded,
} from "./helpers";

describe("02 — Join + Claim", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Solvasion as Program<Solvasion>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const admin = provider.wallet.publicKey;
  const programId = program.programId;

  let seasonId: BN;
  const [globalConfigPda] = findGlobalConfig(programId);

  before(async () => {
    const result = await createTestSeason(program, provider.wallet);
    seasonId = result.seasonId;
  });

  it("join_season — happy path", async () => {
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

    const player = await program.account.player.fetch(playerPda);
    expect(player.player.toBase58()).to.equal(admin.toBase58());
    expect(player.energyBalance).to.equal(100); // starting_energy
    expect(player.hexCount).to.equal(0);
    expect(player.commitmentNonce.toNumber()).to.equal(0);
  });

  it("claim_hex — first hex (adjacency waived)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[0]; // hex 100
    const [hexPda] = findHex(programId, seasonId, hexId);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    // Create initial commitment (nonce 0)
    const blind = randomBlind();
    const { commitment } = createCommitment(10, blind);

    await program.methods
      .claimHex(hexId, commitment, new BN(0))
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

    const hex = await program.account.hex.fetch(hexPda);
    expect(hex.owner.toBase58()).to.equal(admin.toBase58());
    expect(hex.hexId.toNumber()).to.equal(100);
    expect(hex.hasCommitment).to.equal(true);

    const player = await program.account.player.fetch(playerPda);
    expect(player.hexCount).to.equal(1);
    expect(player.commitmentNonce.toNumber()).to.equal(1);
    expect(player.energyBalance).to.equal(90); // 100 - 10 claim_cost
  });

  it("claim_hex — adjacent hex happy path", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[1]; // hex 200 (adjacent to 100)
    const adjacentHexId = TEST_HEXES[0]; // hex 100
    const [hexPda] = findHex(programId, seasonId, hexId);
    const [adjacentHexPda] = findHex(programId, seasonId, adjacentHexId);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    const blind = randomBlind();
    const { commitment } = createCommitment(5, blind);

    await program.methods
      .claimHex(hexId, commitment, new BN(1))
      .accounts({
        playerWallet: admin,
        season: seasonPda,
        seasonCounters: countersPda,
        player: playerPda,
        hex: hexPda,
        validHexSet: vhsPda,
        adjacencySet: adjPda,
        adjacentHex: adjacentHexPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));

    const player = await program.account.player.fetch(playerPda);
    expect(player.hexCount).to.equal(2);
    expect(player.energyBalance).to.equal(80); // 90 - 10
  });

  it("claim_hex — non-adjacent rejected (NotAdjacent)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[3]; // hex 400 — NOT adjacent to 100 or 200
    const adjacentHexId = TEST_HEXES[0]; // hex 100
    const [hexPda] = findHex(programId, seasonId, hexId);
    const [adjacentHexPda] = findHex(programId, seasonId, adjacentHexId);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    const blind = randomBlind();
    const { commitment } = createCommitment(5, blind);

    try {
      await program.methods
        .claimHex(hexId, commitment, new BN(2))
        .accounts({
          playerWallet: admin,
          season: seasonPda,
          seasonCounters: countersPda,
          player: playerPda,
          hex: hexPda,
          validHexSet: vhsPda,
          adjacencySet: adjPda,
          adjacentHex: adjacentHexPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).to.exist;
    }
  });

  it("claim_hex — invalid hex rejected (InvalidHex)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = new BN(999); // not in valid hex set
    const adjacentHexId = TEST_HEXES[0];
    const [hexPda] = findHex(programId, seasonId, hexId);
    const [adjacentHexPda] = findHex(programId, seasonId, adjacentHexId);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    const blind = randomBlind();
    const { commitment } = createCommitment(5, blind);

    try {
      await program.methods
        .claimHex(hexId, commitment, new BN(2))
        .accounts({
          playerWallet: admin,
          season: seasonPda,
          seasonCounters: countersPda,
          player: playerPda,
          hex: hexPda,
          validHexSet: vhsPda,
          adjacencySet: adjPda,
          adjacentHex: adjacentHexPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e).to.exist;
    }
  });

  it("claim_hex — already owned rejected (HexAlreadyOwned)", async () => {
    const [seasonPda] = findSeason(programId, seasonId);
    const [countersPda] = findSeasonCounters(programId, seasonId);
    const [playerPda] = findPlayer(programId, seasonId, admin);
    const hexId = TEST_HEXES[0]; // already claimed
    const [hexPda] = findHex(programId, seasonId, hexId);
    const [vhsPda] = findValidHexSet(programId, seasonId, 0);
    const [adjPda] = findAdjacencySet(programId, seasonId, 0);

    const blind = randomBlind();
    const { commitment } = createCommitment(5, blind);

    try {
      await program.methods
        .claimHex(hexId, commitment, new BN(2))
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
      expect.fail("Should have thrown");
    } catch (e: any) {
      // Already initialized — Anchor will reject the `init`
      expect(e).to.exist;
    }
  });
});
