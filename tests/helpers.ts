import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { Solvasion } from "../target/types/solvasion";
import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

const RistPoint = ristretto255.Point;

// ---- Constants ----

export const DOMAIN_SEP = "Solvasion:DefenceCommitment:H:v1";

export function deriveGeneratorH() {
  return ristretto255_hasher.hashToCurve(utf8ToBytes(DOMAIN_SEP));
}

const H = deriveGeneratorH();

const RISTRETTO_ORDER = BigInt(
  "7237005577332262213973186563042994240857116359379907606001950938285454250989"
);

function bytesToScalar(bytes: Uint8Array): bigint {
  let scalar = BigInt(0);
  for (let i = 0; i < 32; i++) {
    scalar += BigInt(bytes[i]) << BigInt(8 * i);
  }
  return scalar % RISTRETTO_ORDER;
}

// ---- Test map ----
// 5 hexes in a line: h1 <-> h2 <-> h3 <-> h4 <-> h5
// h3 is a landmark. All region 1.
export const TEST_HEXES: BN[] = [
  new BN(100), new BN(200), new BN(300), new BN(400), new BN(500),
];

export const TEST_REGION_IDS: number[] = [1, 1, 1, 1, 1];

// Edges: sorted pairs
export const TEST_EDGES: [BN, BN][] = [
  [new BN(100), new BN(200)],
  [new BN(200), new BN(300)],
  [new BN(300), new BN(400)],
  [new BN(400), new BN(500)],
];

export const TEST_LANDMARK = new BN(300);

// ---- Crypto ----

/**
 * Create a Pedersen commitment: C = amount·G + blind·H
 * The blinding factor must be a canonical scalar (use randomBlind() to generate).
 * The raw blind bytes are passed to the on-chain program as PodScalar.
 */
export function createCommitment(
  amount: number,
  blindingFactor: Uint8Array
): { commitment: number[]; blind: number[] } {
  // Convert blind bytes to BigInt (LE) — no modular reduction needed
  // since randomBlind() already ensures the value is canonical (< ORDER)
  let blindBigInt = BigInt(0);
  for (let i = 0; i < 32; i++) {
    blindBigInt += BigInt(blindingFactor[i]) << BigInt(8 * i);
  }

  // noble/curves rejects scalar 0 in multiply(), so handle edge cases
  let C: InstanceType<typeof RistPoint>;
  if (amount === 0 && blindBigInt === BigInt(0)) {
    // Both zero — identity point (shouldn't happen with random blind)
    throw new Error("Both amount and blind are zero");
  } else if (amount === 0) {
    C = H.multiply(blindBigInt);
  } else if (blindBigInt === BigInt(0)) {
    C = RistPoint.BASE.multiply(BigInt(amount));
  } else {
    const aG = RistPoint.BASE.multiply(BigInt(amount));
    const rH = H.multiply(blindBigInt);
    C = aG.add(rH);
  }
  return {
    commitment: Array.from(C.toBytes()),
    blind: Array.from(blindingFactor),
  };
}

/**
 * Generate a random blinding factor that is a canonical Ristretto scalar (< group order).
 * The Ristretto group order is ~2^252, so we zero the top 4 bits of byte[31]
 * to guarantee the 32-byte LE value is < 2^252 < ORDER.
 * This ensures the on-chain PodScalar is accepted by multiscalar_multiply_ristretto.
 */
export function randomBlind(): Uint8Array {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  bytes[31] &= 0x0f; // clear top 4 bits → value < 2^252 < ORDER
  return bytes;
}

// ---- PDA derivation ----

export function findGlobalConfig(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    programId
  );
}

export function findSeason(
  programId: PublicKey,
  seasonId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("season"), seasonId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function findSeasonCounters(
  programId: PublicKey,
  seasonId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("season_counters"), seasonId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function findPlayer(
  programId: PublicKey,
  seasonId: BN,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("player"),
      seasonId.toArrayLike(Buffer, "le", 8),
      wallet.toBuffer(),
    ],
    programId
  );
}

export function findHex(
  programId: PublicKey,
  seasonId: BN,
  hexId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("hex"),
      seasonId.toArrayLike(Buffer, "le", 8),
      hexId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

export function findAttack(
  programId: PublicKey,
  seasonId: BN,
  attackId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("attack"),
      seasonId.toArrayLike(Buffer, "le", 8),
      attackId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

export function findValidHexSet(
  programId: PublicKey,
  seasonId: BN,
  chunkIndex: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("valid_hexes"),
      seasonId.toArrayLike(Buffer, "le", 8),
      Buffer.from([chunkIndex]),
    ],
    programId
  );
}

export function findAdjacencySet(
  programId: PublicKey,
  seasonId: BN,
  chunkIndex: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("adjacency"),
      seasonId.toArrayLike(Buffer, "le", 8),
      Buffer.from([chunkIndex]),
    ],
    programId
  );
}

export function findReputation(
  programId: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), wallet.toBuffer()],
    programId
  );
}

export function findPhantomRecovery(
  programId: PublicKey,
  seasonId: BN,
  wallet: PublicKey,
  hexId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("phantom"),
      seasonId.toArrayLike(Buffer, "le", 8),
      wallet.toBuffer(),
      hexId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

// ---- Transaction helpers ----

export async function confirmTx(
  connection: anchor.web3.Connection,
  sig: string
): Promise<anchor.web3.TransactionResponse | null> {
  await new Promise((r) => setTimeout(r, 2000));
  return connection.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
}

export async function airdropIfNeeded(
  connection: anchor.web3.Connection,
  wallet: PublicKey,
  minLamports: number = 500_000_000
) {
  const balance = await connection.getBalance(wallet);
  if (balance < minLamports) {
    try {
      const sig = await connection.requestAirdrop(wallet, 1_000_000_000);
      await connection.confirmTransaction(sig, "confirmed");
    } catch {
      // airdrop may fail on rate limit, continue anyway
    }
  }
}

// ---- Season creation helper ----

/**
 * Creates a full season with map data. Returns the season_id (BN).
 * The season uses timing set far in the future so tests can run in any phase.
 */
export async function createTestSeason(
  program: Program<Solvasion>,
  admin: Keypair | anchor.Wallet,
  options: {
    /** If true, war_start = now (allows attacks). Default: false (land rush). */
    warPhase?: boolean;
    /** Override season_end timestamp */
    seasonEnd?: BN;
    /** Override victory_threshold */
    victoryThreshold?: BN;
    /** Use short cooldowns (1 second) for combat tests */
    shortCooldowns?: boolean;
  } = {}
): Promise<{ seasonId: BN }> {
  const provider = program.provider as anchor.AnchorProvider;
  const programId = program.programId;

  // Get current season counter to predict next season_id
  const [globalConfigPda] = findGlobalConfig(programId);

  let globalConfig: any;
  try {
    globalConfig = await program.account.globalConfig.fetch(globalConfigPda);
  } catch {
    // GlobalConfig doesn't exist yet — initialize first
    await program.methods
      .initialize()
      .accounts({
        admin: provider.wallet.publicKey,
        globalConfig: globalConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    await new Promise((r) => setTimeout(r, 2000));
    globalConfig = await program.account.globalConfig.fetch(globalConfigPda);
  }

  const seasonId = new BN(globalConfig.seasonCounter.toNumber() + 1);

  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;
  const warPhase = options.warPhase ?? false;
  const shortCooldowns = options.shortCooldowns ?? false;

  const seasonEnd = options.seasonEnd ?? new BN(now + 28 * oneDay);
  const seasonEndTs = seasonEnd.toNumber();

  // Season timing: if warPhase, war starts immediately; otherwise 7 days away
  // Ensure land_rush_end < season_end (create_season validation)
  const landRushEnd = warPhase
    ? new BN(Math.min(now - 1, seasonEndTs - 2))
    : new BN(now + 7 * oneDay);
  const warStart = warPhase
    ? new BN(Math.min(now - 1, seasonEndTs - 2))
    : new BN(now + 7 * oneDay);
  const escalationStart = new BN(
    Math.min(now + 21 * oneDay, seasonEndTs - 1)
  );
  const joinCutoff = new BN(Math.min(now + 14 * oneDay, seasonEndTs + oneDay));

  const [seasonPda] = findSeason(programId, seasonId);
  const [countersPda] = findSeasonCounters(programId, seasonId);

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
      baseAttackWindow: new BN(shortCooldowns ? 5 : 4 * 3600), // 5s for tests, 4h normal
      extendedAttackWindow: new BN(shortCooldowns ? 10 : 8 * 3600),
      occupationShieldSeconds: new BN(shortCooldowns ? 1 : 3600),
      defenderWinCooldownSeconds: new BN(shortCooldowns ? 1 : 4 * 3600),
      captureCooldownSeconds: new BN(shortCooldowns ? 1 : 1800),
      maxRespawnsPerSeason: 3,
      pointsPerHexPerHour: 10,
      pointsPerLandmarkPerHour: 20,
      victoryThreshold: options.victoryThreshold ?? new BN(50000),
      escalationEnergyMultiplierBps: 15000, // 150%
      escalationAttackCostMultiplierBps: 8000, // 80%
      escalationStage2Start: new BN(Math.min(now + 25 * oneDay, seasonEndTs - 1)),
      escalationStage2EnergyMultiplierBps: 20000,
      escalationStage2AttackCostMultiplierBps: 6000,
      escalationStage2LandmarkMultiplierBps: 20000,
      theatreCaptureBonusPoints: 100,
      theatreDefenceBonusPoints: 50,
      captureBonusPoints: 25,
      attackRefundBps: 1000, // 10%
      attackRefundMinThresholdMultiplier: 3,
      retaliationDiscountBps: 2500, // 25%
      phantomRecoveryEnergy: 15,
      retaliationWindowSeconds: new BN(12 * 3600),
      clutchDefenceBonusPoints: 50,
      clutchWindowSeconds: new BN(300), // 5 min
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
  await new Promise((r) => setTimeout(r, 2000));

  // Init valid hexes (chunk 0)
  const [vhsPda] = findValidHexSet(programId, seasonId, 0);
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
  await new Promise((r) => setTimeout(r, 2000));

  // Append hex data
  await program.methods
    .appendHexData(
      TEST_HEXES,
      Buffer.from(TEST_REGION_IDS)
    )
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      validHexSet: vhsPda,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await new Promise((r) => setTimeout(r, 2000));

  // Init adjacency (chunk 0)
  const [adjPda] = findAdjacencySet(programId, seasonId, 0);
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
  await new Promise((r) => setTimeout(r, 2000));

  // Append adjacency data
  await program.methods
    .appendAdjacencyData(TEST_EDGES)
    .accounts({
      admin: provider.wallet.publicKey,
      globalConfig: globalConfigPda,
      season: seasonPda,
      adjacencySet: adjPda,
    })
    .rpc({ commitment: "confirmed", skipPreflight: true });
  await new Promise((r) => setTimeout(r, 2000));

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
  await new Promise((r) => setTimeout(r, 2000));

  return { seasonId };
}
