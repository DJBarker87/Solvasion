import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(rebuild = false): Database.Database {
  // Ensure directory exists
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (rebuild && fs.existsSync(config.dbPath)) {
    logger.info("Rebuilding database — deleting existing file");
    fs.unlinkSync(config.dbPath);
  }

  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run schema
  const schemaPath = path.resolve(import.meta.dirname, "../db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Ensure indexes exist for existing DBs
  db.exec(`CREATE INDEX IF NOT EXISTS idx_attacks_expiry ON attacks(resolved, deadline)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_slot ON events(season_id, slot)`);

  logger.info(`Database initialized at ${config.dbPath}`);
  return db;
}

// ---- Prepared statements ----

export function preparedStatements(db: Database.Database) {
  return {
    // Seasons
    upsertSeason: db.prepare(`
      INSERT INTO seasons (season_id, phase, land_rush_end, war_start, escalation_start, season_end, victory_threshold, config_json)
      VALUES (@season_id, @phase, @land_rush_end, @war_start, @escalation_start, @season_end, @victory_threshold, @config_json)
      ON CONFLICT(season_id) DO UPDATE SET
        phase = @phase, land_rush_end = @land_rush_end, war_start = @war_start,
        escalation_start = @escalation_start, season_end = @season_end,
        victory_threshold = @victory_threshold, config_json = @config_json
    `),
    updateSeasonPhase: db.prepare(`
      UPDATE seasons SET phase = @phase WHERE season_id = @season_id
    `),
    updateSeasonEnded: db.prepare(`
      UPDATE seasons SET phase = 'Ended', actual_end = @actual_end WHERE season_id = @season_id
    `),
    updateSeasonFinalized: db.prepare(`
      UPDATE seasons SET finalization_complete = 1, winner = @winner, winning_score = @winning_score
      WHERE season_id = @season_id
    `),
    updateSeasonCounters: db.prepare(`
      UPDATE seasons SET player_count = @player_count, total_hexes = @total_hexes
      WHERE season_id = @season_id
    `),
    getSeason: db.prepare(`SELECT * FROM seasons WHERE season_id = ?`),
    getAllSeasons: db.prepare(`SELECT * FROM seasons ORDER BY season_id DESC`),

    // Players
    upsertPlayer: db.prepare(`
      INSERT INTO players (season_id, wallet, energy_balance, energy_committed, hex_count, landmark_count, points, joined_at)
      VALUES (@season_id, @wallet, @energy_balance, @energy_committed, @hex_count, @landmark_count, @points, @joined_at)
      ON CONFLICT(season_id, wallet) DO UPDATE SET
        energy_balance = @energy_balance, energy_committed = @energy_committed,
        hex_count = @hex_count, landmark_count = @landmark_count, points = @points
    `),
    insertPlayer: db.prepare(`
      INSERT OR IGNORE INTO players (season_id, wallet, energy_balance, joined_at)
      VALUES (@season_id, @wallet, @energy_balance, @joined_at)
    `),
    updatePlayerHexCount: db.prepare(`
      UPDATE players SET hex_count = hex_count + @delta,
        landmark_count = landmark_count + @landmark_delta
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerEnergy: db.prepare(`
      UPDATE players SET energy_committed = energy_committed + @delta
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerEnergyReturn: db.prepare(`
      UPDATE players SET energy_balance = energy_balance + @amount
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerAttackStats: db.prepare(`
      UPDATE players SET attacks_launched = attacks_launched + 1
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerAttackWin: db.prepare(`
      UPDATE players SET attacks_won = attacks_won + 1
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerDefenceStats: db.prepare(`
      UPDATE players SET defences_made = defences_made + 1
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerDefenceWin: db.prepare(`
      UPDATE players SET defences_won = defences_won + 1
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerClutch: db.prepare(`
      UPDATE players SET clutch_defences = clutch_defences + 1
      WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerPoints: db.prepare(`
      UPDATE players SET points = @points WHERE season_id = @season_id AND wallet = @wallet
    `),
    updatePlayerFinalized: db.prepare(`
      UPDATE players SET finalized = 1 WHERE season_id = @season_id AND wallet = @wallet
    `),
    getPlayer: db.prepare(`
      SELECT * FROM players WHERE season_id = ? AND wallet = ?
    `),
    getLeaderboard: db.prepare(`
      SELECT * FROM players WHERE season_id = ? ORDER BY points DESC LIMIT ?
    `),
    getSeasonPlayers: db.prepare(`
      SELECT * FROM players WHERE season_id = ? ORDER BY points DESC
    `),

    // Hexes
    upsertHex: db.prepare(`
      INSERT INTO hexes (season_id, hex_id, owner, is_landmark, has_commitment, under_attack, region_id, name, lat, lng, claimed_at, last_owner_change)
      VALUES (@season_id, @hex_id, @owner, @is_landmark, @has_commitment, @under_attack, @region_id, @name, @lat, @lng, @claimed_at, @last_owner_change)
      ON CONFLICT(season_id, hex_id) DO UPDATE SET
        owner = @owner, is_landmark = @is_landmark, has_commitment = @has_commitment,
        under_attack = @under_attack, region_id = @region_id, name = @name,
        lat = @lat, lng = @lng, claimed_at = @claimed_at, last_owner_change = @last_owner_change
    `),
    updateHexOwner: db.prepare(`
      UPDATE hexes SET owner = @owner, last_owner_change = @timestamp, has_commitment = 0
      WHERE season_id = @season_id AND hex_id = @hex_id
    `),
    updateHexClaimed: db.prepare(`
      INSERT INTO hexes (season_id, hex_id, owner, claimed_at, last_owner_change, is_landmark)
      VALUES (@season_id, @hex_id, @owner, @claimed_at, @claimed_at, @is_landmark)
      ON CONFLICT(season_id, hex_id) DO UPDATE SET
        owner = @owner, claimed_at = @claimed_at, last_owner_change = @claimed_at, is_landmark = @is_landmark
    `),
    updateHexCommitment: db.prepare(`
      UPDATE hexes SET has_commitment = @has_commitment
      WHERE season_id = @season_id AND hex_id = @hex_id
    `),
    updateHexUnderAttack: db.prepare(`
      UPDATE hexes SET under_attack = @under_attack
      WHERE season_id = @season_id AND hex_id = @hex_id
    `),
    getHex: db.prepare(`
      SELECT * FROM hexes WHERE season_id = ? AND hex_id = ?
    `),
    getSeasonMap: db.prepare(`
      SELECT * FROM hexes WHERE season_id = ?
    `),
    getPlayerHexes: db.prepare(`
      SELECT * FROM hexes WHERE season_id = ? AND owner = ?
    `),

    // Attacks
    insertAttack: db.prepare(`
      INSERT OR IGNORE INTO attacks (attack_id, season_id, attacker, defender, target_hex, energy_committed, launched_at, deadline)
      VALUES (@attack_id, @season_id, @attacker, @defender, @target_hex, @energy_committed, @launched_at, @deadline)
    `),
    updateAttackResolved: db.prepare(`
      UPDATE attacks SET resolved = 1, result = @result, resolved_at = @resolved_at,
        attacker_committed = @attacker_committed, defender_revealed = @defender_revealed,
        attacker_surplus_returned = @attacker_surplus_returned, attacker_refund = @attacker_refund,
        guardian_reveal = @guardian_reveal
      WHERE season_id = @season_id AND attack_id = @attack_id
    `),
    getAttack: db.prepare(`
      SELECT * FROM attacks WHERE season_id = ? AND attack_id = ?
    `),
    getSeasonAttacks: db.prepare(`
      SELECT * FROM attacks WHERE season_id = ? ORDER BY attack_id DESC LIMIT ?
    `),
    getPendingAttacks: db.prepare(`
      SELECT * FROM attacks WHERE season_id = ? AND resolved = 0
    `),
    getPendingAttacksForWallet: db.prepare(`
      SELECT * FROM attacks WHERE season_id = ? AND defender = ? AND resolved = 0
    `),
    getExpiredAttacks: db.prepare(`
      SELECT * FROM attacks WHERE resolved = 0 AND deadline < ?
    `),

    // Reputations
    upsertReputation: db.prepare(`
      INSERT INTO reputations (wallet, seasons_played, seasons_won, total_attacks, total_wins,
        total_defences, total_defence_wins, best_rank, best_score, total_clutch_defences)
      VALUES (@wallet, @seasons_played, @seasons_won, @total_attacks, @total_wins,
        @total_defences, @total_defence_wins, @best_rank, @best_score, @total_clutch_defences)
      ON CONFLICT(wallet) DO UPDATE SET
        seasons_played = @seasons_played, seasons_won = @seasons_won,
        total_attacks = @total_attacks, total_wins = @total_wins,
        total_defences = @total_defences, total_defence_wins = @total_defence_wins,
        best_rank = CASE WHEN @best_rank < reputations.best_rank OR reputations.best_rank IS NULL THEN @best_rank ELSE reputations.best_rank END,
        best_score = CASE WHEN @best_score > reputations.best_score OR reputations.best_score IS NULL THEN @best_score ELSE reputations.best_score END,
        total_clutch_defences = @total_clutch_defences
    `),
    getReputation: db.prepare(`SELECT * FROM reputations WHERE wallet = ?`),

    // War feed
    insertWarFeed: db.prepare(`
      INSERT INTO war_feed (season_id, event_type, message, hex_id, involved_players, created_at)
      VALUES (@season_id, @event_type, @message, @hex_id, @involved_players, @created_at)
    `),
    getWarFeed: db.prepare(`
      SELECT * FROM war_feed WHERE season_id = ? AND feed_id > ? ORDER BY feed_id ASC LIMIT ?
    `),
    getWarFeedLatest: db.prepare(`
      SELECT * FROM war_feed WHERE season_id = ? ORDER BY feed_id DESC LIMIT ?
    `),

    // Events
    insertEvent: db.prepare(`
      INSERT OR IGNORE INTO events (season_id, event_type, payload, tx_signature, slot, created_at)
      VALUES (@season_id, @event_type, @payload, @tx_signature, @slot, @created_at)
    `),
    getEventsSince: db.prepare(`
      SELECT * FROM events WHERE season_id = ? AND event_id > ? ORDER BY event_id ASC LIMIT ?
    `),
    getLastEventId: db.prepare(`
      SELECT MAX(event_id) as last_id FROM events WHERE season_id = ?
    `),

    // Regions
    upsertRegion: db.prepare(`
      INSERT INTO regions (season_id, region_id, name, hex_count)
      VALUES (@season_id, @region_id, @name, @hex_count)
      ON CONFLICT(season_id, region_id) DO UPDATE SET name = @name, hex_count = @hex_count
    `),
    getSeasonRegions: db.prepare(`
      SELECT * FROM regions WHERE season_id = ? ORDER BY region_id
    `),

    // Indexer state
    getState: db.prepare(`SELECT value FROM indexer_state WHERE key = ?`),
    setState: db.prepare(`
      INSERT INTO indexer_state (key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = @value
    `),

    // Stats
    getGlobalStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM seasons) as total_seasons,
        (SELECT COUNT(DISTINCT wallet) FROM players) as total_players,
        (SELECT SUM(total_hexes) FROM seasons) as total_hexes_claimed
    `),

    // Guardian packets
    upsertGuardianPacket: db.prepare(`
      INSERT INTO guardian_packets (season_id, player_wallet, hex_id, encrypted_blob, iv, auth_tag, nonce, created_at)
      VALUES (@season_id, @player_wallet, @hex_id, @encrypted_blob, @iv, @auth_tag, @nonce, @created_at)
      ON CONFLICT(season_id, player_wallet, hex_id) DO UPDATE SET
        encrypted_blob = @encrypted_blob, iv = @iv, auth_tag = @auth_tag,
        nonce = @nonce, created_at = @created_at
    `),
    getGuardianPacket: db.prepare(`
      SELECT * FROM guardian_packets WHERE season_id = ? AND player_wallet = ? AND hex_id = ?
    `),
    deleteGuardianPacket: db.prepare(`
      DELETE FROM guardian_packets WHERE season_id = ? AND player_wallet = ? AND hex_id = ?
    `),

    // Bot state
    upsertBotState: db.prepare(`
      INSERT INTO bot_state (bot_name, season_id, wallet, hex_count, last_action_at, state)
      VALUES (@bot_name, @season_id, @wallet, @hex_count, @last_action_at, @state)
      ON CONFLICT(bot_name, season_id) DO UPDATE SET
        hex_count = @hex_count, last_action_at = @last_action_at, state = @state
    `),
    getBotState: db.prepare(`
      SELECT * FROM bot_state WHERE bot_name = ? AND season_id = ?
    `),
    getAllBotStates: db.prepare(`
      SELECT * FROM bot_state WHERE season_id = ?
    `),

    // Bot hex secrets
    upsertBotHexSecret: db.prepare(`
      INSERT INTO bot_hex_secrets (season_id, bot_name, hex_id, energy_amount, blind_hex, nonce)
      VALUES (@season_id, @bot_name, @hex_id, @energy_amount, @blind_hex, @nonce)
      ON CONFLICT(season_id, bot_name, hex_id) DO UPDATE SET
        energy_amount = @energy_amount, blind_hex = @blind_hex, nonce = @nonce
    `),
    getBotHexSecret: db.prepare(`
      SELECT * FROM bot_hex_secrets WHERE season_id = ? AND bot_name = ? AND hex_id = ?
    `),
    deleteBotHexSecret: db.prepare(`
      DELETE FROM bot_hex_secrets WHERE season_id = ? AND bot_name = ? AND hex_id = ?
    `),

    // Contracts
    insertContract: db.prepare(`
      INSERT INTO contracts (season_id, contract_type, target_region, target_count, bonus_points, generated_at, expires_at)
      VALUES (@season_id, @contract_type, @target_region, @target_count, @bonus_points, @generated_at, @expires_at)
    `),
    getActiveContracts: db.prepare(`
      SELECT * FROM contracts WHERE season_id = ? AND expires_at > ? ORDER BY contract_id DESC LIMIT 3
    `),
    upsertContractProgress: db.prepare(`
      INSERT INTO contract_progress (contract_id, wallet, current_count, completed, completed_at)
      VALUES (@contract_id, @wallet, @current_count, @completed, @completed_at)
      ON CONFLICT(contract_id, wallet) DO UPDATE SET
        current_count = @current_count, completed = @completed, completed_at = @completed_at
    `),
    getContractProgress: db.prepare(`
      SELECT cp.*, c.contract_type, c.target_region, c.target_count, c.bonus_points, c.expires_at
      FROM contracts c LEFT JOIN contract_progress cp ON c.contract_id = cp.contract_id AND cp.wallet = ?
      WHERE c.season_id = ? AND c.expires_at > ?
      ORDER BY c.contract_id DESC LIMIT 3
    `),

    // Pacts
    insertPact: db.prepare(`
      INSERT INTO pacts (season_id, player_a, player_b, expires_at, accepted, broken, broken_by, created_at)
      VALUES (@season_id, @player_a, @player_b, @expires_at, @accepted, @broken, @broken_by, CAST(strftime('%s','now') AS INTEGER))
    `),
    getPact: db.prepare(`
      SELECT * FROM pacts WHERE season_id = ? AND player_a = ? AND player_b = ?
    `),
    updatePactAccepted: db.prepare(`
      UPDATE pacts SET accepted = 1
      WHERE season_id = @season_id AND player_a = @player_a AND player_b = @player_b
    `),
    updatePactBroken: db.prepare(`
      UPDATE pacts SET broken = 1, broken_by = @broken_by
      WHERE season_id = @season_id AND player_a = @player_a AND player_b = @player_b
    `),
    getPlayerPacts: db.prepare(`
      SELECT * FROM pacts WHERE season_id = ? AND (player_a = ? OR player_b = ?) AND broken = 0 AND expires_at > ?
    `),

    // Telegram subscriptions
    upsertTelegramSub: db.prepare(`
      INSERT INTO telegram_subscriptions (wallet, chat_id, enabled, created_at)
      VALUES (@wallet, @chat_id, @enabled, @created_at)
      ON CONFLICT(wallet) DO UPDATE SET chat_id = @chat_id, enabled = @enabled
    `),
    getTelegramSub: db.prepare(`
      SELECT * FROM telegram_subscriptions WHERE wallet = ? AND enabled = 1
    `),
    disableTelegramSub: db.prepare(`
      UPDATE telegram_subscriptions SET enabled = 0 WHERE wallet = ?
    `),
  };
}

export type Statements = ReturnType<typeof preparedStatements>;
