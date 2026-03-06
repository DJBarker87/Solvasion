-- Solvasion Backend Schema

CREATE TABLE IF NOT EXISTS seasons (
  season_id       INTEGER PRIMARY KEY,
  phase           TEXT NOT NULL DEFAULT 'LandRush',
  land_rush_end   INTEGER,
  war_start       INTEGER,
  escalation_start INTEGER,
  season_end      INTEGER,
  actual_end      INTEGER,
  player_count    INTEGER DEFAULT 0,
  total_hexes     INTEGER DEFAULT 0,
  winner          TEXT,
  winning_score   INTEGER,
  victory_threshold INTEGER,
  finalization_complete INTEGER DEFAULT 0,
  config_json     TEXT
);

CREATE TABLE IF NOT EXISTS players (
  season_id       INTEGER NOT NULL,
  wallet          TEXT NOT NULL,
  energy_balance  INTEGER DEFAULT 0,
  energy_committed INTEGER DEFAULT 0,
  hex_count       INTEGER DEFAULT 0,
  landmark_count  INTEGER DEFAULT 0,
  points          INTEGER DEFAULT 0,
  joined_at       INTEGER,
  shield_start_hour INTEGER DEFAULT 0,
  attacks_launched INTEGER DEFAULT 0,
  attacks_won     INTEGER DEFAULT 0,
  defences_made   INTEGER DEFAULT 0,
  defences_won    INTEGER DEFAULT 0,
  clutch_defences INTEGER DEFAULT 0,
  finalized       INTEGER DEFAULT 0,
  PRIMARY KEY (season_id, wallet)
);

CREATE TABLE IF NOT EXISTS hexes (
  season_id       INTEGER NOT NULL,
  hex_id          TEXT NOT NULL,
  owner           TEXT,
  is_landmark     INTEGER DEFAULT 0,
  has_commitment  INTEGER DEFAULT 0,
  under_attack    INTEGER DEFAULT 0,
  region_id       INTEGER,
  name            TEXT,
  lat             REAL,
  lng             REAL,
  claimed_at      INTEGER,
  last_owner_change INTEGER,
  PRIMARY KEY (season_id, hex_id)
);

CREATE TABLE IF NOT EXISTS attacks (
  attack_id       INTEGER NOT NULL,
  season_id       INTEGER NOT NULL,
  attacker        TEXT NOT NULL,
  defender        TEXT NOT NULL,
  target_hex      TEXT NOT NULL,
  origin_hex      TEXT,
  energy_committed INTEGER,
  launched_at     INTEGER,
  deadline        INTEGER,
  resolved        INTEGER DEFAULT 0,
  result          TEXT,
  resolved_at     INTEGER,
  attacker_committed INTEGER,
  defender_revealed INTEGER,
  attacker_surplus_returned INTEGER,
  attacker_refund INTEGER,
  guardian_reveal INTEGER DEFAULT 0,
  PRIMARY KEY (season_id, attack_id)
);

CREATE TABLE IF NOT EXISTS reputations (
  wallet          TEXT PRIMARY KEY,
  seasons_played  INTEGER DEFAULT 0,
  seasons_won     INTEGER DEFAULT 0,
  total_attacks   INTEGER DEFAULT 0,
  total_wins      INTEGER DEFAULT 0,
  total_defences  INTEGER DEFAULT 0,
  total_defence_wins INTEGER DEFAULT 0,
  best_rank       INTEGER,
  best_score      INTEGER,
  total_clutch_defences INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS war_feed (
  feed_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id       INTEGER NOT NULL,
  event_type      TEXT NOT NULL,
  message         TEXT NOT NULL,
  hex_id          TEXT,
  involved_players TEXT,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id       INTEGER,
  event_type      TEXT NOT NULL,
  payload         TEXT NOT NULL,
  tx_signature    TEXT NOT NULL,
  slot            INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup ON events(tx_signature, event_type);

CREATE TABLE IF NOT EXISTS regions (
  season_id       INTEGER NOT NULL,
  region_id       INTEGER NOT NULL,
  name            TEXT NOT NULL,
  hex_count       INTEGER DEFAULT 0,
  PRIMARY KEY (season_id, region_id)
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);

-- Guardian auto-reveal packets
CREATE TABLE IF NOT EXISTS guardian_packets (
  season_id       INTEGER NOT NULL,
  player_wallet   TEXT NOT NULL,
  hex_id          TEXT NOT NULL,
  encrypted_blob  BLOB NOT NULL,
  iv              BLOB NOT NULL,
  auth_tag        BLOB NOT NULL,
  nonce           INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_wallet, hex_id)
);

-- Bot controller state
CREATE TABLE IF NOT EXISTS bot_state (
  bot_name        TEXT NOT NULL,
  season_id       INTEGER NOT NULL,
  wallet          TEXT NOT NULL,
  hex_count       INTEGER DEFAULT 0,
  last_action_at  INTEGER DEFAULT 0,
  state           TEXT DEFAULT 'idle',
  PRIMARY KEY (bot_name, season_id)
);

-- Bot hex defence secrets (blinding factors)
CREATE TABLE IF NOT EXISTS bot_hex_secrets (
  season_id       INTEGER NOT NULL,
  bot_name        TEXT NOT NULL,
  hex_id          TEXT NOT NULL,
  energy_amount   INTEGER NOT NULL,
  blind_hex       TEXT NOT NULL,
  nonce           INTEGER NOT NULL,
  PRIMARY KEY (season_id, bot_name, hex_id)
);

-- Daily contracts
CREATE TABLE IF NOT EXISTS contracts (
  contract_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id       INTEGER NOT NULL,
  contract_type   TEXT NOT NULL,
  target_region   INTEGER,
  target_count    INTEGER DEFAULT 1,
  bonus_points    INTEGER NOT NULL,
  generated_at    INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contract_progress (
  contract_id     INTEGER NOT NULL,
  wallet          TEXT NOT NULL,
  current_count   INTEGER DEFAULT 0,
  completed       INTEGER DEFAULT 0,
  completed_at    INTEGER,
  PRIMARY KEY (contract_id, wallet)
);

-- Pacts
CREATE TABLE IF NOT EXISTS pacts (
  season_id       INTEGER NOT NULL,
  player_a        TEXT NOT NULL,
  player_b        TEXT NOT NULL,
  expires_at      INTEGER NOT NULL,
  accepted        INTEGER DEFAULT 0,
  broken          INTEGER DEFAULT 0,
  broken_by       TEXT,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_a, player_b)
);

-- Telegram notification subscriptions
CREATE TABLE IF NOT EXISTS telegram_subscriptions (
  wallet          TEXT PRIMARY KEY,
  chat_id         TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_players_season ON players(season_id);
CREATE INDEX IF NOT EXISTS idx_players_points ON players(season_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_hexes_season ON hexes(season_id);
CREATE INDEX IF NOT EXISTS idx_hexes_owner ON hexes(season_id, owner);
CREATE INDEX IF NOT EXISTS idx_attacks_season ON attacks(season_id);
CREATE INDEX IF NOT EXISTS idx_attacks_pending ON attacks(season_id, resolved, deadline);
CREATE INDEX IF NOT EXISTS idx_attacks_defender ON attacks(season_id, defender, resolved);
CREATE INDEX IF NOT EXISTS idx_war_feed_season ON war_feed(season_id, feed_id DESC);
CREATE INDEX IF NOT EXISTS idx_events_season ON events(season_id, event_id);
CREATE INDEX IF NOT EXISTS idx_attacks_expiry ON attacks(resolved, deadline);
CREATE INDEX IF NOT EXISTS idx_events_slot ON events(season_id, slot);
