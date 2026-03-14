import { Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { config } from "../config.js";
import { getConnection, idl } from "../solana.js";
import { getDb, preparedStatements } from "../db.js";
import { submitRevealDefence } from "../utils/reveal.js";
import { logger } from "../utils/logger.js";
import { BOT_NAMES, deriveBotKeypair, deriveBotBlind, ensureBotFunded, type BotName } from "./wallet.js";
import { BOT_PERSONALITIES, pickTaunt } from "./config.js";
import { botTick } from "./strategy.js";
import { startIncursionScheduler, stopIncursionScheduler } from "./incursions.js";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BotInstance {
  name: BotName;
  keypair: Keypair;
  program: Program;
  timer: ReturnType<typeof setInterval> | null;
}

let bots: BotInstance[] = [];
let enabled = false;

export interface AttackData {
  seasonId: number;
  attackId: number;
  attacker: string;
  defender: string;
  targetHex: string;
}

export async function startBots(): Promise<boolean> {
  const botSeed = config.botSeed;
  if (!botSeed) {
    logger.info("Bots disabled — BOT_SEED not set");
    return false;
  }

  const conn = getConnection();

  for (const name of BOT_NAMES) {
    const keypair = deriveBotKeypair(botSeed, name);

    // Fund bot if needed
    try {
      await ensureBotFunded(keypair);
    } catch (err) {
      logger.error(`Failed to fund bot ${name}`, { error: String(err) });
      continue;
    }

    // Create signing program for this bot
    const wallet = new anchor.Wallet(keypair);
    const provider = new anchor.AnchorProvider(conn, wallet, {
      commitment: config.commitment,
      skipPreflight: true,
    });
    const program = new Program(idl, provider);

    bots.push({ name, keypair, program, timer: null });
    logger.info(`Bot ${name} initialized — wallet: ${keypair.publicKey.toBase58()}`);
  }

  // Find active season
  const db = getDb();
  const stmts = preparedStatements(db);
  const seasons = stmts.getAllSeasons.all() as any[];
  const activeSeason = seasons.find((s: any) => s.phase !== "Ended");

  if (!activeSeason) {
    logger.info("No active season found — bots idle");
    enabled = true;
    return true;
  }

  const seasonId = activeSeason.season_id;

  // Announce faction goals at startup
  announceFactions(seasonId, stmts);

  // Start staggered tick timers (every 30s, 10s apart)
  bots.forEach((bot, i) => {
    const initialDelay = i * 10_000;
    setTimeout(() => {
      // Run first tick
      runBotTick(bot, seasonId);
      // Then every 30s
      bot.timer = setInterval(() => runBotTick(bot, seasonId), 30_000);
    }, initialDelay);
  });

  // Start incursion scheduler
  startIncursionScheduler(seasonId);

  enabled = true;
  logger.info(`Bot controller started — ${bots.length} bots for season ${seasonId}`);
  return true;
}

function runBotTick(bot: BotInstance, seasonId: number) {
  botTick(bot.name, bot.keypair, bot.program, seasonId).catch((err) => {
    logger.error(`Bot ${bot.name} tick failed`, { error: String(err) });
  });
}

/**
 * Announce each faction's goal in the war feed at season start.
 */
function announceFactions(seasonId: number, stmts: ReturnType<typeof preparedStatements>) {
  const now = Math.floor(Date.now() / 1000);

  for (const bot of bots) {
    const personality = BOT_PERSONALITIES[bot.name];

    // Lore announcement
    stmts.insertWarFeed.run({
      season_id: seasonId,
      event_type: "BotAnnouncement",
      message: `${personality.displayName} enters the fray: "${personality.lore}"`,
      hex_id: null,
      involved_players: JSON.stringify([]),
      created_at: now,
    });

    // Goal announcement
    stmts.insertWarFeed.run({
      season_id: seasonId,
      event_type: "BotGoal",
      message: `${personality.displayName}: ${personality.goalAnnouncement}`,
      hex_id: null,
      involved_players: JSON.stringify([]),
      created_at: now + 1, // ensure ordering
    });
  }

  logger.info("Faction goals announced in war feed");
}

/**
 * Called when an AttackLaunched event is indexed.
 * If the defender is a bot, auto-reveal with a randomised delay (10-90s).
 */
export async function onAttackLaunched(data: AttackData): Promise<void> {
  if (!enabled) return;

  const { seasonId, attackId, attacker, defender, targetHex } = data;

  // Check if the defender is one of our bots
  const bot = bots.find((b) => b.keypair.publicKey.toBase58() === defender);
  if (!bot) return;

  // Randomised delay: 10-90 seconds to simulate human reaction time
  const revealDelay = 10_000 + Math.floor(Math.random() * 80_000);
  logger.info(`Bot ${bot.name} is under attack on hex ${targetHex} — revealing in ${Math.round(revealDelay / 1000)}s`);

  setTimeout(async () => {
    await executeReveal(bot, seasonId, attackId, attacker, targetHex);
  }, revealDelay);
}

async function executeReveal(
  bot: BotInstance,
  seasonId: number,
  attackId: number,
  attacker: string,
  targetHex: string,
): Promise<void> {
  // Look up stored secret
  const db = getDb();
  const stmts = preparedStatements(db);
  const secret = stmts.getBotHexSecret.get(seasonId, bot.name, targetHex) as any;

  if (!secret) {
    logger.warn(`Bot ${bot.name} has no stored secret for hex ${targetHex}`);
    return;
  }

  // Re-derive the blinding factor deterministically — never stored in DB
  const botSeed = config.botSeed;
  const blindBytes = deriveBotBlind(botSeed, bot.name, targetHex, secret.nonce);

  try {
    await submitRevealDefence(
      bot.program,
      seasonId,
      attackId,
      targetHex,
      attacker,
      bot.keypair.publicKey.toBase58(),
      secret.energy_amount,
      blindBytes
    );

    logger.info(`Bot ${bot.name} revealed defence for hex ${targetHex}`);

    // Delete the consumed secret (commitment consumed on any reveal)
    stmts.deleteBotHexSecret.run(seasonId, bot.name, targetHex);

    // Emit a taunt into the war feed
    const taunt = pickTaunt(bot.name, "onDefend");
    stmts.insertWarFeed.run({
      season_id: seasonId,
      event_type: "BotTaunt",
      message: `${BOT_PERSONALITIES[bot.name].displayName}: "${taunt}"`,
      hex_id: targetHex,
      involved_players: JSON.stringify([attacker]),
      created_at: Math.floor(Date.now() / 1000),
    });
  } catch (err: any) {
    const msg = String(err);
    if (!msg.includes("AttackAlreadyResolved")) {
      logger.error(`Bot ${bot.name} auto-reveal failed for hex ${targetHex}`, { error: msg });
    }
  }
}

export function stopBots() {
  for (const bot of bots) {
    if (bot.timer) {
      clearInterval(bot.timer);
      bot.timer = null;
    }
  }
  bots = [];
  enabled = false;
  stopIncursionScheduler();
  logger.info("Bot controller stopped");
}
