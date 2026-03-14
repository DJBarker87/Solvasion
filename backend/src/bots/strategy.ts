import BN from "bn.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import { getDb, preparedStatements } from "../db.js";
import { config } from "../config.js";
import {
  findSeason, findSeasonCounters, findPlayer,
  findHex, findAttack,
} from "../utils/pda.js";
import { createCommitment } from "../utils/pedersen.js";
import { logger } from "../utils/logger.js";
import type { BotName } from "./wallet.js";
import { deriveBotBlind } from "./wallet.js";
import { BOT_PERSONALITIES } from "./config.js";
import { getActiveIncursionRegion } from "./incursions.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pick from candidates with preference for the bot's preferred region.
 * 70% chance to pick from preferred region if available, else random.
 */
function pickWithRegionPreference(botName: BotName, candidates: any[]): any {
  const preferred = BOT_PERSONALITIES[botName].preferredRegion;
  const inRegion = candidates.filter((h: any) => h.region_id === preferred);
  if (inRegion.length > 0 && Math.random() < 0.7) {
    return inRegion[Math.floor(Math.random() * inRegion.length)];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Check how many human players are active. Used for adaptive scaling —
 * bots become less aggressive when more humans are playing.
 */
function getHumanPlayerCount(seasonId: number, stmts: ReturnType<typeof preparedStatements>): number {
  const allBots = stmts.getAllBotStates.all(seasonId) as any[];
  const botWallets = new Set(allBots.map((b: any) => b.wallet));
  const allPlayers = stmts.getLeaderboard.all(seasonId) as any[];
  return allPlayers.filter((p: any) => !botWallets.has(p.wallet)).length;
}

/**
 * Adaptive tick probability — bots act less frequently when many humans are playing.
 * With 0 humans: 100% tick chance. With 10+: 40% tick chance.
 */
function shouldTickThisCycle(seasonId: number, stmts: ReturnType<typeof preparedStatements>): boolean {
  const humanCount = getHumanPlayerCount(seasonId, stmts);
  const tickChance = Math.max(0.4, 1.0 - humanCount * 0.06);
  return Math.random() < tickChance;
}

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

  // Adaptive scaling — skip some ticks when lots of humans are playing
  if (!shouldTickThisCycle(seasonId, stmts)) return;

  // Get bot's player state from DB
  const botWallet = botKeypair.publicKey.toBase58();
  const player = stmts.getPlayer.get(seasonId, botWallet) as any;

  if (!player) {
    await joinSeason(botName, botKeypair, program, seasonId);
    return;
  }

  const phase = season.phase;
  const personality = BOT_PERSONALITIES[botName];

  if (phase === "LandRush" || phase === "War" || phase.startsWith("Escalation")) {
    const claimed = await tryClaim(botName, botKeypair, program, seasonId, stmts);
    if (claimed) {
      await delay(2000);
    }
  }

  if (phase === "War" || phase.startsWith("Escalation")) {
    await tryDefend(botName, botKeypair, program, seasonId, stmts);
    await delay(2000);

    // Archetype-driven attack probability
    if (Math.random() < personality.aggressiveness) {
      await tryAttack(botName, botKeypair, program, seasonId, stmts);
    }
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

  const target = pickWithRegionPreference(botName, unclaimed);
  const hexBN = new BN(target.hex_id);
  const seasonBN = new BN(seasonId);
  const programId = config.programId;

  const [seasonPda] = findSeason(programId, seasonBN);
  const [countersPda] = findSeasonCounters(programId, seasonBN);
  const [playerPda] = findPlayer(programId, seasonBN, botKeypair.publicKey);
  const [hexPda] = findHex(programId, seasonBN, hexBN);

  const claimEnergy = 5;

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

  // Derive blinding factor deterministically — never stored
  const blind = deriveBotBlind(config.botSeed, botName, target.hex_id, nonce);
  const { commitment } = createCommitment(claimEnergy, blind);

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
      blind_hex: "",
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
  const personality = BOT_PERSONALITIES[botName];

  const undefended = ownedHexes.filter(
    (h: any) => !h.has_commitment && !h.under_attack
  );
  if (undefended.length === 0) return;

  const programId = config.programId;
  const seasonBN = new BN(seasonId);
  const [seasonPda] = findSeason(programId, seasonBN);
  const [playerPda] = findPlayer(programId, seasonBN, botKeypair.publicKey);

  // Turtles defend more hexes per tick, aggressors fewer
  const maxDefencePerTick = personality.archetype === "turtle" ? 4 : 2;

  for (const hex of undefended.slice(0, maxDefencePerTick)) {
    // Scale defence energy by archetype
    const baseMin = personality.archetype === "turtle" ? 15 : 8;
    const baseMax = personality.archetype === "turtle" ? 35 : 20;
    const energyAmount = baseMin + Math.floor(Math.random() * (baseMax - baseMin + 1));

    const hexBN = new BN(hex.hex_id);
    const [hexPda] = findHex(programId, seasonBN, hexBN);

    // Get current nonce from on-chain
    const nonce = await getBotNonce(program, seasonId, botKeypair);

    // Derive blinding factor deterministically — never stored
    const blind = deriveBotBlind(config.botSeed, botName, hex.hex_id, nonce);
    const { commitment } = createCommitment(energyAmount, blind);

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
        blind_hex: "",
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
  const personality = BOT_PERSONALITIES[botName];

  // Minimum energy threshold varies by archetype
  const minEnergyToAttack = personality.archetype === "turtle" ? 80 : 50;
  if (!player || player.energy_balance < minEnergyToAttack) return;

  const ownedHexes = stmts.getPlayerHexes.all(seasonId, botWallet) as any[];

  // Turtles: always defend before attacking. Others: defend if > 30% undefended
  const undefended = ownedHexes.filter((h: any) => !h.has_commitment && !h.under_attack);
  if (personality.archetype === "turtle" && undefended.length > 0) return;
  if (undefended.length > ownedHexes.length * 0.3) return;

  const allHexes = stmts.getSeasonMap.all(seasonId) as any[];

  // Get all bot wallets to avoid attacking other bots
  const allBots = stmts.getAllBotStates.all(seasonId) as any[];
  const botWallets = new Set(allBots.map((b: any) => b.wallet));

  const enemyHexes = allHexes.filter(
    (h: any) => h.owner && h.owner !== botWallet && !botWallets.has(h.owner) && !h.under_attack
  );
  if (enemyHexes.length === 0) return;

  // Prioritize incursion region, then landmarks, then region preference
  const incursionRegion = getActiveIncursionRegion(botName);
  let target: any;
  if (incursionRegion !== null) {
    const inRegion = enemyHexes.filter((h: any) => h.region_id === incursionRegion);
    target = inRegion.length > 0
      ? inRegion[Math.floor(Math.random() * inRegion.length)]
      : pickWithRegionPreference(botName, enemyHexes);
  } else {
    // Traders prioritize landmarks more aggressively (60%)
    const landmarkPriority = personality.archetype === "trader" ? 0.6 : 0.4;
    const landmarks = enemyHexes.filter((h: any) => h.is_landmark);
    if (landmarks.length > 0 && Math.random() < landmarkPriority) {
      target = landmarks[Math.floor(Math.random() * landmarks.length)];
    } else {
      target = pickWithRegionPreference(botName, enemyHexes);
    }
  }

  // Scale attack energy with season phase and archetype
  const seasonData = stmts.getSeason.get(seasonId) as any;
  const phase = seasonData?.phase ?? "War";
  let baseMin = 20, baseMax = 40;
  if (phase === "EscalationStage1") { baseMin = 30; baseMax = 55; }
  else if (phase === "EscalationStage2") { baseMin = 40; baseMax = 70; }
  // During incursion, attack harder
  if (incursionRegion !== null) { baseMin += 10; baseMax += 15; }
  // Aggressors commit more to attacks, turtles commit less
  if (personality.archetype === "aggressor") { baseMin += 10; baseMax += 10; }
  else if (personality.archetype === "turtle") { baseMin -= 5; baseMax -= 10; }

  const attackEnergy = baseMin + Math.floor(Math.random() * (baseMax - baseMin + 1));

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
