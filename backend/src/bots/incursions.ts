import { getDb, preparedStatements } from "../db.js";
import { logger } from "../utils/logger.js";
import { notifyIncursion } from "../telegram/index.js";
import { BOT_PERSONALITIES, pickTaunt } from "./config.js";
import type { BotName } from "./wallet.js";

interface IncursionPlan {
  botName: BotName;
  regionId: number;
  regionName: string;
  scheduledAt: number; // unix timestamp of attack execution
  announced: boolean;
  executed: boolean;
}

let pendingIncursions: IncursionPlan[] = [];
let incursionTimer: ReturnType<typeof setInterval> | null = null;

const MIN_DAYS_BETWEEN = 3;
const MAX_DAYS_BETWEEN = 5;
const ADVANCE_WARNING_HOURS = 6;
const ATTACKS_PER_INCURSION = 4; // 3-5 attacks

let lastIncursionTime = 0;
let nextIncursionTime = 0;

export function startIncursionScheduler(seasonId: number) {
  // Schedule first incursion 1-2 days from now
  const delayDays = 1 + Math.random();
  nextIncursionTime = Math.floor(Date.now() / 1000) + delayDays * 86400;
  lastIncursionTime = Math.floor(Date.now() / 1000);

  // Check every 5 minutes
  incursionTimer = setInterval(() => {
    checkIncursions(seasonId).catch(err =>
      logger.error("Incursion check failed", { error: String(err) })
    );
  }, 300_000);

  logger.info("Incursion scheduler started");
}

export function stopIncursionScheduler() {
  if (incursionTimer) {
    clearInterval(incursionTimer);
    incursionTimer = null;
  }
  pendingIncursions = [];
}

async function checkIncursions(seasonId: number) {
  const now = Math.floor(Date.now() / 1000);
  const db = getDb();
  const stmts = preparedStatements(db);

  const season = stmts.getSeason.get(seasonId) as any;
  if (!season || season.phase === "Ended" || season.phase === "LandRush") return;

  // Check if it's time to plan a new incursion
  if (now >= nextIncursionTime && !pendingIncursions.some(p => !p.executed)) {
    planIncursion(seasonId, stmts);
  }

  // Process pending incursions
  for (const plan of pendingIncursions) {
    if (plan.executed) continue;

    // Announce 6 hours before
    const announceTime = plan.scheduledAt - ADVANCE_WARNING_HOURS * 3600;
    if (!plan.announced && now >= announceTime) {
      announceIncursion(seasonId, plan, stmts);
      plan.announced = true;
    }

    // Execute at scheduled time
    if (now >= plan.scheduledAt) {
      plan.executed = true;
      // Execution is handled by the main bot tick — we just mark targets
      emitIncursionAttackFeed(seasonId, plan, stmts);
    }
  }
}

function planIncursion(seasonId: number, stmts: ReturnType<typeof preparedStatements>) {
  const botNames = Object.keys(BOT_PERSONALITIES) as BotName[];
  const botName = botNames[Math.floor(Math.random() * botNames.length)];
  const personality = BOT_PERSONALITIES[botName];

  // Pick a region — prefer bot's preferred region 60% of the time
  const regions = stmts.getSeasonRegions.all(seasonId) as any[];
  if (regions.length === 0) return;

  let targetRegion: any;
  if (Math.random() < 0.6) {
    targetRegion = regions.find((r: any) => r.region_id === personality.preferredRegion);
  }
  if (!targetRegion) {
    targetRegion = regions[Math.floor(Math.random() * regions.length)];
  }

  const scheduledAt = Math.floor(Date.now() / 1000) + ADVANCE_WARNING_HOURS * 3600;

  const plan: IncursionPlan = {
    botName,
    regionId: targetRegion.region_id,
    regionName: targetRegion.name,
    scheduledAt,
    announced: false,
    executed: false,
  };

  pendingIncursions.push(plan);

  // Schedule next incursion
  const daysBetween = MIN_DAYS_BETWEEN + Math.random() * (MAX_DAYS_BETWEEN - MIN_DAYS_BETWEEN);
  nextIncursionTime = scheduledAt + daysBetween * 86400;
  lastIncursionTime = scheduledAt;

  logger.info(`Planned incursion: ${botName} → ${targetRegion.name} at ${new Date(scheduledAt * 1000).toISOString()}`);
}

function announceIncursion(
  seasonId: number,
  plan: IncursionPlan,
  stmts: ReturnType<typeof preparedStatements>,
) {
  const displayName = BOT_PERSONALITIES[plan.botName].displayName;

  // War feed announcement
  stmts.insertWarFeed.run({
    season_id: seasonId,
    event_type: "BotIncursion",
    message: `${displayName} is preparing an assault on ${plan.regionName}! Attacks in ${ADVANCE_WARNING_HOURS} hours.`,
    hex_id: null,
    involved_players: JSON.stringify([]),
    created_at: Math.floor(Date.now() / 1000),
  });

  // Telegram alerts to players with territory in the region
  const hexesInRegion = (stmts.getSeasonMap.all(seasonId) as any[])
    .filter((h: any) => h.region_id === plan.regionId && h.owner);

  const affectedWallets = [...new Set(hexesInRegion.map((h: any) => h.owner as string))];

  // Filter out bot wallets
  const allBots = stmts.getAllBotStates.all(seasonId) as any[];
  const botWallets = new Set(allBots.map((b: any) => b.wallet));
  const humanWallets = affectedWallets.filter(w => !botWallets.has(w));

  notifyIncursion({
    factionName: displayName,
    regionName: plan.regionName,
    hoursUntil: ADVANCE_WARNING_HOURS,
    affectedWallets: humanWallets,
  }).catch(() => {});

  logger.info(`Incursion announced: ${displayName} → ${plan.regionName}`);
}

function emitIncursionAttackFeed(
  seasonId: number,
  plan: IncursionPlan,
  stmts: ReturnType<typeof preparedStatements>,
) {
  const displayName = BOT_PERSONALITIES[plan.botName].displayName;
  const taunt = pickTaunt(plan.botName, "onAttack");

  stmts.insertWarFeed.run({
    season_id: seasonId,
    event_type: "BotIncursion",
    message: `${displayName} launches a coordinated assault on ${plan.regionName}!`,
    hex_id: null,
    involved_players: JSON.stringify([]),
    created_at: Math.floor(Date.now() / 1000),
  });

  stmts.insertWarFeed.run({
    season_id: seasonId,
    event_type: "BotTaunt",
    message: `${displayName}: "${taunt}"`,
    hex_id: null,
    involved_players: JSON.stringify([]),
    created_at: Math.floor(Date.now() / 1000),
  });
}

/**
 * Get the current incursion target region for a bot (if any).
 * Used by strategy.ts to direct attacks during active incursions.
 */
export function getActiveIncursionRegion(botName: BotName): number | null {
  const now = Math.floor(Date.now() / 1000);
  for (const plan of pendingIncursions) {
    if (plan.botName === botName && plan.announced && !plan.executed) {
      return plan.regionId;
    }
    // Also during 30 min after execution for multi-attack window
    if (plan.botName === botName && plan.executed && now - plan.scheduledAt < 1800) {
      return plan.regionId;
    }
  }
  return null;
}
