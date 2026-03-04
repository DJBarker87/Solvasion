import BN from "bn.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { getDb, preparedStatements } from "../db.js";
import { config } from "../config.js";
import {
  findSeason, findSeasonCounters, findPlayer,
  findHex, findAttack,
} from "../utils/pda.js";
import { createCommitment, randomBlind } from "../utils/pedersen.js";
import { logger } from "../utils/logger.js";
import type { BotName } from "./wallet.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a single tick for a bot. Called every 30s (staggered per bot).
 */
export async function botTick(
  botName: BotName,
  botKeypair: Keypair,
  program: Program,
  seasonId: number
): Promise<void> {
  const db = getDb();
  const stmts = preparedStatements(db);

  // Get current season phase
  const season = stmts.getSeason.get(seasonId) as any;
  if (!season || season.phase === "Ended") return;

  // Get bot's player state from DB
  const botWallet = botKeypair.publicKey.toBase58();
  const player = stmts.getPlayer.get(seasonId, botWallet) as any;

  if (!player) {
    await joinSeason(botName, botKeypair, program, seasonId);
    return;
  }

  const phase = season.phase;

  if (phase === "LandRush" || phase === "War" || phase.startsWith("Escalation")) {
    const claimed = await tryClaim(botName, botKeypair, program, seasonId, stmts);
    if (claimed) {
      await delay(2000);
    }
  }

  if (phase === "War" || phase.startsWith("Escalation")) {
    await tryDefend(botName, botKeypair, program, seasonId, stmts);
    await delay(2000);
    await tryAttack(botName, botKeypair, program, seasonId, stmts);
  }

  stmts.upsertBotState.run({
    bot_name: botName,
    season_id: seasonId,
    wallet: botWallet,
    hex_count: player.hex_count ?? 0,
    last_action_at: Math.floor(Date.now() / 1000),
    state: phase === "LandRush" ? "claiming" : "active",
  });
}

async function joinSeason(
  botName: BotName,
  botKeypair: Keypair,
  program: Program,
  seasonId: number
): Promise<void> {
  const programId = config.programId;
  const seasonBN = new BN(seasonId);

  const [seasonPda] = findSeason(programId, seasonBN);
  const [countersPda] = findSeasonCounters(programId, seasonBN);
  const [playerPda] = findPlayer(programId, seasonBN, botKeypair.publicKey);

  try {
    await program.methods
      .joinSeason()
      .accounts({
        playerWallet: botKeypair.publicKey,
        season: seasonPda,
        seasonCounters: countersPda,
        player: playerPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });

    logger.info(`Bot ${botName} joined season ${seasonId}`);
  } catch (err: any) {
    const msg = String(err);
    if (msg.includes("already in use")) {
      logger.debug(`Bot ${botName} already joined season ${seasonId}`);
    } else {
      logger.error(`Bot ${botName} failed to join season`, { error: msg });
    }
  }
}

/**
 * Get the bot's current commitment_nonce from on-chain player account.
 */
async function getBotNonce(program: Program, seasonId: number, botKeypair: Keypair): Promise<number> {
  const programId = config.programId;
  const seasonBN = new BN(seasonId);
  const [playerPda] = findPlayer(programId, seasonBN, botKeypair.publicKey);
  try {
    const playerAccount = await (program.account as any).player.fetch(playerPda);
    return playerAccount.commitmentNonce?.toNumber?.() ?? playerAccount.commitmentNonce ?? 0;
  } catch {
    return 0;
  }
}

async function tryClaim(
  botName: BotName,
  botKeypair: Keypair,
  program: Program,
  seasonId: number,
  stmts: ReturnType<typeof preparedStatements>
): Promise<boolean> {
  const allHexes = stmts.getSeasonMap.all(seasonId) as any[];
  const unclaimed = allHexes.filter((h: any) => !h.owner);
  if (unclaimed.length === 0) return false;

  const target = unclaimed[Math.floor(Math.random() * unclaimed.length)];
  const hexBN = new BN(target.hex_id);
  const seasonBN = new BN(seasonId);
  const programId = config.programId;

  const [seasonPda] = findSeason(programId, seasonBN);
  const [countersPda] = findSeasonCounters(programId, seasonBN);
  const [playerPda] = findPlayer(programId, seasonBN, botKeypair.publicKey);
  const [hexPda] = findHex(programId, seasonBN, hexBN);

  const blind = randomBlind();
  const claimEnergy = 5;
  const { commitment } = createCommitment(claimEnergy, blind);

  const [vhsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("valid_hexes"), seasonBN.toArrayLike(Buffer, "le", 8), Buffer.from([0])],
    programId
  );
  const [adjPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("adjacency"), seasonBN.toArrayLike(Buffer, "le", 8), Buffer.from([0])],
    programId
  );

  // Get current nonce from on-chain
  const nonce = await getBotNonce(program, seasonId, botKeypair);

  // Find an owned hex for adjacency proof (if not first claim)
  const botWallet = botKeypair.publicKey.toBase58();
  const ownedHexes = stmts.getPlayerHexes.all(seasonId, botWallet) as any[];

  // If bot already owns hexes, provide adjacentHex for adjacency proof
  let adjacentHexPubkey: PublicKey | null = null;
  if (ownedHexes.length > 0) {
    const adjHex = ownedHexes[0];
    [adjacentHexPubkey] = findHex(programId, seasonBN, new BN(adjHex.hex_id));
  }

  const accounts: Record<string, any> = {
    playerWallet: botKeypair.publicKey,
    season: seasonPda,
    seasonCounters: countersPda,
    player: playerPda,
    hex: hexPda,
    validHexSet: vhsPda,
    adjacencySet: adjPda,
    adjacentHex: adjacentHexPubkey,
    systemProgram: SystemProgram.programId,
  };

  try {
    await program.methods
      .claimHex(hexBN, commitment, new BN(nonce))
      .accounts(accounts)
      .rpc({ commitment: "confirmed", skipPreflight: true });

    stmts.upsertBotHexSecret.run({
      season_id: seasonId,
      bot_name: botName,
      hex_id: target.hex_id,
      energy_amount: claimEnergy,
      blind_hex: Buffer.from(blind).toString("hex"),
      nonce,
    });

    logger.info(`Bot ${botName} claimed hex ${target.hex_id}`);
    return true;
  } catch (err: any) {
    const msg = String(err);
    if (!msg.includes("already in use") && !msg.includes("HexAlreadyOwned")) {
      logger.error(`Bot ${botName} claim failed for hex ${target.hex_id}`, { error: msg });
    }
    return false;
  }
}

async function tryDefend(
  botName: BotName,
  botKeypair: Keypair,
  program: Program,
  seasonId: number,
  stmts: ReturnType<typeof preparedStatements>
): Promise<void> {
  const botWallet = botKeypair.publicKey.toBase58();
  const ownedHexes = stmts.getPlayerHexes.all(seasonId, botWallet) as any[];

  const undefended = ownedHexes.filter(
    (h: any) => !h.has_commitment && !h.under_attack
  );
  if (undefended.length === 0) return;

  const programId = config.programId;
  const seasonBN = new BN(seasonId);
  const [seasonPda] = findSeason(programId, seasonBN);
  const [playerPda] = findPlayer(programId, seasonBN, botKeypair.publicKey);

  for (const hex of undefended.slice(0, 2)) {
    const energyAmount = 10 + Math.floor(Math.random() * 11); // 10-20
    const blind = randomBlind();
    const { commitment } = createCommitment(energyAmount, blind);

    const hexBN = new BN(hex.hex_id);
    const [hexPda] = findHex(programId, seasonBN, hexBN);

    // Get current nonce from on-chain
    const nonce = await getBotNonce(program, seasonId, botKeypair);

    try {
      // Always use increase_defence — it works whether hex has a commitment or not
      await program.methods
        .increaseDefence(hexBN, commitment, new BN(nonce), energyAmount)
        .accounts({
          playerWallet: botKeypair.publicKey,
          season: seasonPda,
          player: playerPda,
          hex: hexPda,
        })
        .rpc({ commitment: "confirmed", skipPreflight: true });

      stmts.upsertBotHexSecret.run({
        season_id: seasonId,
        bot_name: botName,
        hex_id: hex.hex_id,
        energy_amount: energyAmount,
        blind_hex: Buffer.from(blind).toString("hex"),
        nonce,
      });

      logger.info(`Bot ${botName} defended hex ${hex.hex_id} with ${energyAmount} energy`);
      await delay(2000);
    } catch (err: any) {
      logger.error(`Bot ${botName} defence failed for hex ${hex.hex_id}`, {
        error: String(err),
      });
    }
  }
}

async function tryAttack(
  botName: BotName,
  botKeypair: Keypair,
  program: Program,
  seasonId: number,
  stmts: ReturnType<typeof preparedStatements>
): Promise<void> {
  const botWallet = botKeypair.publicKey.toBase58();
  const player = stmts.getPlayer.get(seasonId, botWallet) as any;
  if (!player || player.energy_balance < 50) return;

  const ownedHexes = stmts.getPlayerHexes.all(seasonId, botWallet) as any[];
  const undefended = ownedHexes.filter((h: any) => !h.has_commitment && !h.under_attack);
  if (undefended.length > 0) return; // defend first

  const allHexes = stmts.getSeasonMap.all(seasonId) as any[];

  // Get all bot wallets to avoid attacking other bots
  const allBots = stmts.getAllBotStates.all(seasonId) as any[];
  const botWallets = new Set(allBots.map((b: any) => b.wallet));

  const enemyHexes = allHexes.filter(
    (h: any) => h.owner && h.owner !== botWallet && !botWallets.has(h.owner) && !h.under_attack
  );
  if (enemyHexes.length === 0) return;

  const target = enemyHexes[Math.floor(Math.random() * enemyHexes.length)];
  const attackEnergy = 20 + Math.floor(Math.random() * 21); // 20-40

  const programId = config.programId;
  const seasonBN = new BN(seasonId);
  const hexBN = new BN(target.hex_id);

  const [seasonPda] = findSeason(programId, seasonBN);
  const [countersPda] = findSeasonCounters(programId, seasonBN);
  const [playerPda] = findPlayer(programId, seasonBN, botKeypair.publicKey);
  const [defenderPda] = findPlayer(programId, seasonBN, new PublicKey(target.owner));
  const [hexPda] = findHex(programId, seasonBN, hexBN);

  if (ownedHexes.length === 0) return;
  const originHex = ownedHexes[Math.floor(Math.random() * ownedHexes.length)];
  const originBN = new BN(originHex.hex_id);
  const [originHexPda] = findHex(programId, seasonBN, originBN);

  const [adjPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("adjacency"), seasonBN.toArrayLike(Buffer, "le", 8), Buffer.from([0])],
    programId
  );

  try {
    const counters = await (program.account as any).seasonCounters.fetch(
      findSeasonCounters(programId, seasonBN)[0]
    );
    const attackId = new BN(counters.nextAttackId);
    const [attackPda] = findAttack(programId, seasonBN, attackId);

    await program.methods
      .launchAttack(hexBN, originBN, attackEnergy, 0)
      .accounts({
        playerWallet: botKeypair.publicKey,
        season: seasonPda,
        seasonCounters: countersPda,
        playerAttacker: playerPda,
        playerDefender: defenderPda,
        hexTarget: hexPda,
        hexOrigin: originHexPda,
        adjacencySet: adjPda,
        attack: attackPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });

    logger.info(`Bot ${botName} attacked hex ${target.hex_id} with ${attackEnergy} energy`);
  } catch (err: any) {
    const msg = String(err);
    if (!msg.includes("InsufficientEnergy") && !msg.includes("NotAdjacent")) {
      logger.error(`Bot ${botName} attack failed on hex ${target.hex_id}`, { error: msg });
    }
  }
}
