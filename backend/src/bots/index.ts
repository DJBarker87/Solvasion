import { Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { config } from "../config.js";
import { getConnection, idl } from "../solana.js";
import { getDb, preparedStatements } from "../db.js";
import { submitRevealDefence } from "../utils/reveal.js";
import { logger } from "../utils/logger.js";
import { BOT_NAMES, deriveBotKeypair, ensureBotFunded, type BotName } from "./wallet.js";
import { botTick } from "./strategy.js";

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
 * Called when an AttackLaunched event is indexed.
 * If the defender is a bot, auto-reveal using the bot's own keypair.
 */
export async function onAttackLaunched(data: AttackData): Promise<void> {
  if (!enabled) return;

  const { seasonId, attackId, attacker, defender, targetHex } = data;

  // Check if the defender is one of our bots
  const bot = bots.find((b) => b.keypair.publicKey.toBase58() === defender);
  if (!bot) return;

  logger.info(`Bot ${bot.name} is under attack on hex ${targetHex} — auto-revealing`);

  // Look up stored secret
  const db = getDb();
  const stmts = preparedStatements(db);
  const secret = stmts.getBotHexSecret.get(seasonId, bot.name, targetHex) as any;

  if (!secret) {
    logger.warn(`Bot ${bot.name} has no stored secret for hex ${targetHex}`);
    return;
  }

  const blindBytes = Buffer.from(secret.blind_hex, "hex");

  try {
    await submitRevealDefence(
      bot.program,
      seasonId,
      attackId,
      targetHex,
      attacker,
      defender,
      secret.energy_amount,
      blindBytes
    );

    logger.info(`Bot ${bot.name} auto-revealed defence for hex ${targetHex}`);

    // Delete the consumed secret (commitment consumed on any reveal)
    stmts.deleteBotHexSecret.run(seasonId, bot.name, targetHex);
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
  logger.info("Bot controller stopped");
}
