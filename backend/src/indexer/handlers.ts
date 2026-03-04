import type { Statements } from "../db.js";
import { logger } from "../utils/logger.js";
import { onAttackLaunched as guardianReveal } from "../guardian/index.js";
import { onAttackLaunched as botReveal } from "../bots/index.js";
import { pickTaunt, BOT_PERSONALITIES } from "../bots/config.js";
import type { BotName } from "../bots/wallet.js";

// Convert BN/anchor values to plain numbers
function n(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  if (val.toNumber) return val.toNumber();
  return Number(val);
}

function s(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (val.toBase58) return val.toBase58();
  if (val.toString) return val.toString();
  return String(val);
}

const OUTCOME_NAMES: Record<number, string> = {
  0: "AttackerWins",
  1: "DefenderWins",
  2: "Timeout",
};

/**
 * Normalize event data keys from snake_case to camelCase.
 * Anchor 0.32 IDL uses snake_case field names in deserialized event data.
 */
function camelCaseKeys(obj: any): any {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(camelCaseKeys);
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = value;
    // Also keep original key so either access pattern works
    if (camel !== key) result[key] = value;
  }
  return result;
}

export function handleEvent(
  eventName: string,
  data: any,
  stmts: Statements,
  txSignature: string
) {
  const handler = handlers[eventName];
  if (handler) {
    handler(camelCaseKeys(data), stmts, txSignature);
  } else {
    logger.debug(`No handler for event: ${eventName}`);
  }
}

const handlers: Record<string, (data: any, stmts: Statements, tx: string) => void> = {
  // ---- Season lifecycle ----

  SeasonCreated(data, stmts) {
    stmts.upsertSeason.run({
      season_id: n(data.seasonId),
      phase: "LandRush",
      land_rush_end: n(data.startTime), // approximate — reconciliation corrects
      war_start: null,
      escalation_start: null,
      season_end: n(data.endTime),
      victory_threshold: null,
      config_json: null,
    });
    addWarFeed(stmts, n(data.seasonId), "SeasonCreated", "A new season has begun!", null, []);
  },

  MapFinalized(data, stmts) {
    stmts.updateSeasonCounters.run({
      season_id: n(data.seasonId),
      player_count: 0,
      total_hexes: n(data.hexCount),
    });
  },

  PhaseChanged(data, stmts) {
    const phaseNames: Record<number, string> = {
      0: "LandRush",
      1: "War",
      2: "EscalationStage1",
      3: "EscalationStage2",
      4: "Ended",
    };
    const phase = phaseNames[n(data.newPhase)] ?? `Unknown(${n(data.newPhase)})`;
    stmts.updateSeasonPhase.run({
      season_id: n(data.seasonId),
      phase,
    });
    addWarFeed(stmts, n(data.seasonId), "PhaseChanged", `Phase changed to ${phase}`, null, []);
  },

  SeasonEnded(data, stmts) {
    const reason = n(data.endReason) === 0 ? "Victory achieved" : "Time expired";
    stmts.updateSeasonEnded.run({
      season_id: n(data.seasonId),
      actual_end: Math.floor(Date.now() / 1000),
    });
    addWarFeed(stmts, n(data.seasonId), "SeasonEnded", `Season ended: ${reason}`, null, []);
  },

  SeasonFinalized(data, stmts) {
    stmts.updateSeasonFinalized.run({
      season_id: n(data.seasonId),
      winner: s(data.winner),
      winning_score: n(data.winningScore),
    });
    addWarFeed(
      stmts, n(data.seasonId), "SeasonFinalized",
      `Season finalized! Winner: ${s(data.winner).slice(0, 8)}... with ${n(data.winningScore)} points`,
      null, [s(data.winner)]
    );
  },

  FinalizationProgress(data, stmts) {
    // Informational — just log it
    logger.debug("FinalizationProgress", {
      seasonId: n(data.seasonId),
      playersProcessed: n(data.playersProcessed),
      currentLeader: s(data.currentLeader),
    });
  },

  // ---- Player events ----

  PlayerJoined(data, stmts) {
    const seasonId = n(data.seasonId);
    const wallet = s(data.player);
    stmts.insertPlayer.run({
      season_id: seasonId,
      wallet,
      energy_balance: n(data.startingEnergy),
      joined_at: n(data.joinedAt),
    });
    // Update season player count
    const season = stmts.getSeason.get(seasonId) as any;
    if (season) {
      stmts.updateSeasonCounters.run({
        season_id: seasonId,
        player_count: (season.player_count ?? 0) + 1,
        total_hexes: season.total_hexes ?? 0,
      });
    }
    addWarFeed(stmts, seasonId, "PlayerJoined",
      `${wallet.slice(0, 8)}... joined the battle`, null, [wallet]);
  },

  // ---- Hex events ----

  HexClaimed(data, stmts) {
    const seasonId = n(data.seasonId);
    const hexId = String(n(data.hexId));
    const player = s(data.player);
    const isLandmark = data.isLandmark ? 1 : 0;

    stmts.updateHexClaimed.run({
      season_id: seasonId,
      hex_id: hexId,
      owner: player,
      claimed_at: Math.floor(Date.now() / 1000),
      is_landmark: isLandmark,
    });
    stmts.updatePlayerHexCount.run({
      season_id: seasonId,
      wallet: player,
      delta: 1,
      landmark_delta: isLandmark,
    });
    const label = isLandmark ? "landmark " : "";
    addWarFeed(stmts, seasonId, "HexClaimed",
      `${player.slice(0, 8)}... claimed ${label}hex ${hexId}`,
      hexId, [player]);
  },

  // ---- Defence events ----

  DefencesCommitted(data, stmts) {
    const seasonId = n(data.seasonId);
    const wallet = s(data.player);
    stmts.updatePlayerEnergy.run({
      season_id: seasonId,
      wallet,
      delta: n(data.totalEnergyDelta),
    });
  },

  DefenceWithdrawn(data, stmts) {
    const seasonId = n(data.seasonId);
    const wallet = s(data.player);
    const hexId = String(n(data.hexId));
    stmts.updateHexCommitment.run({
      season_id: seasonId,
      hex_id: hexId,
      has_commitment: 0,
    });
    stmts.updatePlayerEnergy.run({
      season_id: seasonId,
      wallet,
      delta: -n(data.energyAmount),
    });
  },

  DefenceRecommitted(data, stmts) {
    const seasonId = n(data.seasonId);
    const hexId = String(n(data.hexId));
    stmts.updateHexCommitment.run({
      season_id: seasonId,
      hex_id: hexId,
      has_commitment: 1,
    });
  },

  DefenceIncreased(data, stmts) {
    const seasonId = n(data.seasonId);
    const wallet = s(data.player);
    const hexId = String(n(data.hexId));
    stmts.updatePlayerEnergy.run({
      season_id: seasonId,
      wallet,
      delta: n(data.delta),
    });
    stmts.updateHexCommitment.run({
      season_id: seasonId,
      hex_id: hexId,
      has_commitment: 1,
    });
  },

  // ---- Attack events ----

  AttackLaunched(data, stmts) {
    const seasonId = n(data.seasonId);
    const attackId = n(data.attackId);
    const attacker = s(data.attacker);
    const defender = s(data.defender);
    const hexId = String(n(data.targetHex));

    stmts.insertAttack.run({
      attack_id: attackId,
      season_id: seasonId,
      attacker,
      defender,
      target_hex: hexId,
      energy_committed: n(data.energy),
      launched_at: Math.floor(Date.now() / 1000),
      deadline: n(data.deadline),
    });
    stmts.updateHexUnderAttack.run({
      season_id: seasonId,
      hex_id: hexId,
      under_attack: 1,
    });
    stmts.updatePlayerAttackStats.run({
      season_id: seasonId,
      wallet: attacker,
    });
    addWarFeed(stmts, seasonId, "AttackLaunched",
      `${attacker.slice(0, 8)}... attacks hex ${hexId} held by ${defender.slice(0, 8)}...`,
      hexId, [attacker, defender]);

    // Bot taunt on attack
    const attackerBot = findBotByWallet(stmts, seasonId, attacker);
    if (attackerBot) {
      const taunt = pickTaunt(attackerBot, "onAttack");
      addWarFeed(stmts, seasonId, "BotTaunt",
        `${attackerBot}: "${taunt}"`, hexId, [attacker]);
    }

    // Fire-and-forget async auto-reveal calls
    const attackData = { seasonId, attackId, attacker, defender, targetHex: hexId };
    guardianReveal(attackData).catch(err =>
      logger.error("Guardian auto-reveal error", { error: String(err) })
    );
    botReveal(attackData).catch(err =>
      logger.error("Bot auto-reveal error", { error: String(err) })
    );
  },

  AttackResolved(data, stmts) {
    const seasonId = n(data.seasonId);
    const attackId = n(data.attackId);
    const hexId = String(n(data.hexId));
    const attacker = s(data.attacker);
    const defender = s(data.defender);
    const outcome = n(data.outcome);
    const outcomeName = OUTCOME_NAMES[outcome] ?? "Unknown";

    stmts.updateAttackResolved.run({
      season_id: seasonId,
      attack_id: attackId,
      result: outcomeName,
      resolved_at: Math.floor(Date.now() / 1000),
      attacker_committed: n(data.attackerCommitted),
      defender_revealed: n(data.defenderRevealed),
      attacker_surplus_returned: n(data.attackerSurplusReturned),
      attacker_refund: n(data.attackerRefund),
      guardian_reveal: data.guardianReveal ? 1 : 0,
    });

    stmts.updateHexUnderAttack.run({
      season_id: seasonId,
      hex_id: hexId,
      under_attack: 0,
    });

    // Clear defender's commitment (consumed on ANY reveal)
    stmts.updateHexCommitment.run({
      season_id: seasonId,
      hex_id: hexId,
      has_commitment: 0,
    });

    if (outcome === 0) {
      // Attacker wins — transfer hex ownership
      stmts.updateHexOwner.run({
        season_id: seasonId,
        hex_id: hexId,
        owner: attacker,
        timestamp: Math.floor(Date.now() / 1000),
      });
      stmts.updatePlayerAttackWin.run({ season_id: seasonId, wallet: attacker });
      // Adjust hex counts
      const hex = stmts.getHex.get(seasonId, hexId) as any;
      const isLandmark = hex?.is_landmark ?? 0;
      stmts.updatePlayerHexCount.run({
        season_id: seasonId, wallet: attacker, delta: 1, landmark_delta: isLandmark,
      });
      stmts.updatePlayerHexCount.run({
        season_id: seasonId, wallet: defender, delta: -1, landmark_delta: -isLandmark,
      });
    } else if (outcome === 1) {
      // Defender wins
      stmts.updatePlayerDefenceWin.run({ season_id: seasonId, wallet: defender });
    }
    // outcome === 2 is timeout — attacker wins by default
    if (outcome === 2) {
      stmts.updateHexOwner.run({
        season_id: seasonId,
        hex_id: hexId,
        owner: attacker,
        timestamp: Math.floor(Date.now() / 1000),
      });
      stmts.updatePlayerAttackWin.run({ season_id: seasonId, wallet: attacker });
      const hex = stmts.getHex.get(seasonId, hexId) as any;
      const isLandmark = hex?.is_landmark ?? 0;
      stmts.updatePlayerHexCount.run({
        season_id: seasonId, wallet: attacker, delta: 1, landmark_delta: isLandmark,
      });
      stmts.updatePlayerHexCount.run({
        season_id: seasonId, wallet: defender, delta: -1, landmark_delta: -isLandmark,
      });
    }

    stmts.updatePlayerDefenceStats.run({ season_id: seasonId, wallet: defender });

    const msg = outcome === 0
      ? `${attacker.slice(0, 8)}... captured hex ${hexId} from ${defender.slice(0, 8)}...`
      : outcome === 1
        ? `${defender.slice(0, 8)}... defended hex ${hexId} against ${attacker.slice(0, 8)}...`
        : `${attacker.slice(0, 8)}... captured hex ${hexId} via timeout`;
    addWarFeed(stmts, seasonId, "AttackResolved", msg, hexId, [attacker, defender]);

    // Bot taunts on resolution
    if (outcome === 0 || outcome === 2) {
      const capBot = findBotByWallet(stmts, seasonId, attacker);
      if (capBot) {
        addWarFeed(stmts, seasonId, "BotTaunt",
          `${capBot}: "${pickTaunt(capBot, "onCapture")}"`, hexId, [attacker]);
      }
    }
    if (outcome === 1) {
      const defBot = findBotByWallet(stmts, seasonId, defender);
      if (defBot) {
        addWarFeed(stmts, seasonId, "BotTaunt",
          `${defBot}: "${pickTaunt(defBot, "onDefend")}"`, hexId, [defender]);
      }
    }
  },

  AttackRefunded(data, stmts) {
    const seasonId = n(data.seasonId);
    stmts.updatePlayerEnergyReturn.run({
      season_id: seasonId,
      wallet: s(data.player),
      amount: n(data.refundAmount),
    });
  },

  // ---- Victory ----

  VictoryThresholdReached(data, stmts) {
    const seasonId = n(data.seasonId);
    const player = s(data.player);
    addWarFeed(stmts, seasonId, "VictoryThresholdReached",
      `${player.slice(0, 8)}... reached the victory threshold with ${n(data.score)} points!`,
      null, [player]);
  },

  // ---- Phantom energy ----

  PhantomEnergyRecovered(data, stmts) {
    stmts.updatePlayerEnergyReturn.run({
      season_id: n(data.seasonId),
      wallet: s(data.player),
      amount: n(data.energyRecovered),
    });
  },

  // ---- Theatre ----

  TheatreActivated(data, stmts) {
    const seasonId = n(data.seasonId);
    addWarFeed(stmts, seasonId, "TheatreActivated",
      `Theatre activated in regions ${data.theatreRegions.join(",")}!`,
      null, []);
  },

  TheatreBonusAwarded(data, stmts) {
    // Points already added on-chain — this is informational
    const bonusType = n(data.bonusType) === 0 ? "capture" : "defence";
    logger.debug(`Theatre bonus: ${s(data.player)} got ${n(data.points)} for ${bonusType}`);
  },

  // ---- Retaliation ----

  RetaliationTokenGranted(data, stmts) {
    logger.debug(`Retaliation token: ${s(data.player)} → ${s(data.target)}`);
  },

  RetaliationTokenUsed(data, stmts) {
    logger.debug(`Retaliation used: ${s(data.player)} → ${s(data.target)}`);
  },

  // ---- Posture ----

  PostureSet(data, stmts) {
    logger.debug(`Posture set: ${s(data.player)} type=${n(data.postureType)}`);
  },

  // ---- Guardian ----

  GuardianSet(data, stmts) {
    logger.debug(`Guardian set: ${s(data.player)} → ${s(data.guardianPubkey)}`);
  },

  GuardianCleared(data, stmts) {
    logger.debug(`Guardian cleared: ${s(data.player)}`);
  },

  GuardianRevealSubmitted(data, stmts) {
    const seasonId = n(data.seasonId);
    addWarFeed(stmts, seasonId, "GuardianRevealSubmitted",
      `Guardian revealed defence for hex ${n(data.hexId)} (attack ${n(data.attackId)})`,
      String(n(data.hexId)), [s(data.guardianPubkey)]);
  },

  // ---- Clutch ----

  ClutchDefence(data, stmts) {
    const seasonId = n(data.seasonId);
    const player = s(data.player);
    stmts.updatePlayerClutch.run({ season_id: seasonId, wallet: player });
    addWarFeed(stmts, seasonId, "ClutchDefence",
      `${player.slice(0, 8)}... made a clutch defence on hex ${n(data.hexId)}!`,
      String(n(data.hexId)), [player]);
  },

  // ---- Account closure ----

  HexAccountClosed(data, stmts) {
    logger.debug(`Hex account closed: season=${n(data.seasonId)} hex=${n(data.hexId)}`);
  },

  PlayerAccountClosed(data, stmts) {
    const seasonId = n(data.seasonId);
    const wallet = s(data.player);
    stmts.updatePlayerFinalized.run({ season_id: seasonId, wallet });
  },
};

// ---- Bot lookup helper ----

function findBotByWallet(stmts: Statements, seasonId: number, wallet: string): BotName | null {
  const bots = stmts.getAllBotStates.all(seasonId) as Array<{ bot_name: string; wallet: string }>;
  const match = bots.find(b => b.wallet === wallet);
  if (match && match.bot_name in BOT_PERSONALITIES) {
    return match.bot_name as BotName;
  }
  return null;
}

// ---- War feed helper ----

function addWarFeed(
  stmts: Statements,
  seasonId: number,
  eventType: string,
  message: string,
  hexId: string | null,
  involvedPlayers: string[]
) {
  stmts.insertWarFeed.run({
    season_id: seasonId,
    event_type: eventType,
    message,
    hex_id: hexId,
    involved_players: JSON.stringify(involvedPlayers),
    created_at: Math.floor(Date.now() / 1000),
  });
}
