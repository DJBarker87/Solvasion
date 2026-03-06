import { getDb, preparedStatements } from "./db.js";
import { logger } from "./utils/logger.js";

const CONTRACT_TYPES = [
  { type: "attack_region", label: "Attack any hex in {region}", points: 150 },
  { type: "defend_n", label: "Defend {n} attacks successfully", points: 100 },
  { type: "capture_landmark", label: "Capture a landmark", points: 200 },
  { type: "reinforce_n", label: "Reinforce {n} hexes", points: 50 },
  { type: "theatre_capture", label: "Capture {n} hexes in active theatre", points: 150 },
];

let contractTimer: ReturnType<typeof setInterval> | null = null;

export function startContractService(seasonId: number) {
  // Generate initial contracts if none exist
  generateDailyContracts(seasonId);

  // Check every 5 minutes if new contracts are needed (daily at 00:00 UTC)
  contractTimer = setInterval(() => {
    generateDailyContracts(seasonId);
  }, 300_000);

  logger.info("Contract service started");
}

export function stopContractService() {
  if (contractTimer) {
    clearInterval(contractTimer);
    contractTimer = null;
  }
}

function generateDailyContracts(seasonId: number) {
  const db = getDb();
  const stmts = preparedStatements(db);
  const now = Math.floor(Date.now() / 1000);

  // Check if we already have active contracts
  const active = stmts.getActiveContracts.all(seasonId, now) as any[];
  if (active.length >= 3) return;

  // Get regions for this season
  const regions = stmts.getSeasonRegions.all(seasonId) as any[];
  if (regions.length === 0) return;

  // Generate 3 contracts for today
  const todayStart = Math.floor(now / 86400) * 86400; // midnight UTC
  const expiresAt = todayStart + 86400; // next midnight

  // Pick 3 different contract types
  const shuffled = [...CONTRACT_TYPES].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, 3);

  for (const contractDef of selected) {
    const region = regions[Math.floor(Math.random() * regions.length)];
    const targetCount = contractDef.type === "defend_n" ? 2 + Math.floor(Math.random() * 2)
      : contractDef.type === "reinforce_n" ? 3 + Math.floor(Math.random() * 3)
      : contractDef.type === "theatre_capture" ? 2
      : 1;

    stmts.insertContract.run({
      season_id: seasonId,
      contract_type: contractDef.type,
      target_region: region.region_id,
      target_count: targetCount,
      bonus_points: contractDef.points,
      generated_at: now,
      expires_at: expiresAt,
    });
  }

  logger.info(`Generated ${selected.length} daily contracts for season ${seasonId}`);
}

/**
 * Track progress on contracts after game events.
 * Called from event handlers.
 */
export function trackContractProgress(
  seasonId: number,
  wallet: string,
  eventType: string,
  regionId?: number,
  isLandmark?: boolean,
  isTheatre?: boolean,
) {
  const db = getDb();
  const stmts = preparedStatements(db);
  const now = Math.floor(Date.now() / 1000);

  const contracts = stmts.getActiveContracts.all(seasonId, now) as any[];

  for (const contract of contracts) {
    let matched = false;

    switch (contract.contract_type) {
      case "attack_region":
        if ((eventType === "HexClaimed" || eventType === "AttackResolved") &&
          regionId === contract.target_region) {
          matched = true;
        }
        break;
      case "defend_n":
        if (eventType === "DefenderWins") {
          matched = true;
        }
        break;
      case "capture_landmark":
        if ((eventType === "HexClaimed" || eventType === "AttackResolved") && isLandmark) {
          matched = true;
        }
        break;
      case "reinforce_n":
        if (eventType === "DefenceIncreased") {
          matched = true;
        }
        break;
      case "theatre_capture":
        if ((eventType === "HexClaimed" || eventType === "AttackResolved") && isTheatre) {
          matched = true;
        }
        break;
    }

    if (matched) {
      // Get current progress
      const progress = db.prepare(
        "SELECT * FROM contract_progress WHERE contract_id = ? AND wallet = ?"
      ).get(contract.contract_id, wallet) as any;

      const currentCount = (progress?.current_count ?? 0) + 1;
      const completed = currentCount >= contract.target_count ? 1 : 0;

      stmts.upsertContractProgress.run({
        contract_id: contract.contract_id,
        wallet,
        current_count: currentCount,
        completed,
        completed_at: completed ? now : null,
      });

      if (completed && !progress?.completed) {
        // Add war feed entry for contract completion
        stmts.insertWarFeed.run({
          season_id: seasonId,
          event_type: "ContractCompleted",
          message: `${wallet.slice(0, 8)}... completed a contract! (+${contract.bonus_points} pts)`,
          hex_id: null,
          involved_players: JSON.stringify([wallet]),
          created_at: now,
        });
      }
    }
  }
}
