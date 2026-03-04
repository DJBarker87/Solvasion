// Backend row types (match schema.sql columns)

export interface Season {
  season_id: number;
  phase: 'LandRush' | 'War' | 'EscalationStage1' | 'EscalationStage2' | 'Ended';
  land_rush_end: number | null;
  war_start: number | null;
  escalation_start: number | null;
  season_end: number | null;
  actual_end: number | null;
  player_count: number;
  total_hexes: number;
  winner: string | null;
  winning_score: number | null;
  victory_threshold: number | null;
  finalization_complete: number;
  config_json: string | null;
}

export interface HexRow {
  season_id: number;
  hex_id: string;        // u64 string
  owner: string | null;
  is_landmark: number;
  has_commitment: number;
  under_attack: number;
  region_id: number | null;
  name: string | null;
  lat: number | null;
  lng: number | null;
  claimed_at: number | null;
  last_owner_change: number | null;
}

export interface Player {
  season_id: number;
  wallet: string;
  energy_balance: number;
  energy_committed: number;
  hex_count: number;
  landmark_count: number;
  points: number;
  joined_at: number | null;
  attacks_launched: number;
  attacks_won: number;
  defences_made: number;
  defences_won: number;
  clutch_defences: number;
}

export interface Attack {
  attack_id: number;
  season_id: number;
  attacker: string;
  defender: string;
  target_hex: string;
  origin_hex: string | null;
  energy_committed: number | null;
  launched_at: number | null;
  deadline: number | null;
  resolved: number;
  result: string | null;
  resolved_at: number | null;
}

export interface FeedItem {
  feed_id: number;
  season_id: number;
  event_type: string;
  message: string;
  hex_id: string | null;
  involved_players: string | null;
  created_at: number;
}

export interface Region {
  season_id: number;
  region_id: number;
  name: string;
  hex_count: number;
}

// Map data file (from generate-map.ts output)

export interface LandmarkEntry {
  name: string;
  hex_h3: string;
  hex_u64: string;
  region_id: number;
  region_name: string;
}

export interface RegionSummary {
  id: number;
  name: string;
  hexCount: number;
}

export interface MapDataFile {
  metadata: {
    hex_count: number;
    edge_count: number;
    landmark_count: number;
    season_preset: string;
    season_name: string;
    h3_resolution: number;
  };
  hex_ids: string[];       // u64 strings
  hex_ids_h3: string[];    // H3 strings (same index)
  region_ids: number[];    // region per hex (same index)
  landmarks: LandmarkEntry[];
  bridge_edges: Array<{
    name: string;
    hex_a_h3: string;
    hex_b_h3: string;
    hex_a_u64: string;
    hex_b_u64: string;
  }>;
  region_summary: RegionSummary[];
}

// Enriched hex for display

export interface EnrichedHex {
  hexId: string;           // u64
  h3Index: string;         // H3 string
  regionId: number;
  regionName: string;
  landmarkName: string | null;
  owner: string | null;
  isLandmark: boolean;
  hasCommitment: boolean;
  underAttack: boolean;
  claimedAt: number | null;
}

export interface HexFeatureProps {
  hexId: string;
  h3Index: string;
  fillColor: string;
  lineColor: string;
  lineWidth: number;
  regionName: string;
  landmarkName: string | null;
  owner: string | null;
  isLandmark: boolean;
  hasCommitment: boolean;
  underAttack: boolean;
}
