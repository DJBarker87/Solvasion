import type { Season, HexRow, Player, FeedItem, Region, Attack } from '../types';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export async function fetchSeasons(): Promise<Season[]> {
  const data = await get<{ seasons: Season[] }>('/api/seasons');
  return data.seasons;
}

export async function fetchSeason(id: number): Promise<{ season: Season; regions: Region[] }> {
  return get(`/api/seasons/${id}`);
}

export async function fetchMap(seasonId: number): Promise<HexRow[]> {
  const data = await get<{ hexes: HexRow[] }>(`/api/seasons/${seasonId}/map`);
  return data.hexes;
}

export async function fetchLeaderboard(seasonId: number, limit = 50): Promise<Player[]> {
  const data = await get<{ players: Player[] }>(`/api/seasons/${seasonId}/leaderboard?limit=${limit}`);
  return data.players;
}

export async function fetchFeed(seasonId: number, since = 0, limit = 50): Promise<FeedItem[]> {
  const params = since > 0 ? `since=${since}&limit=${limit}` : `limit=${limit}`;
  const data = await get<{ feed: FeedItem[] }>(`/api/seasons/${seasonId}/feed?${params}`);
  return data.feed;
}

export async function fetchPlayer(seasonId: number, wallet: string): Promise<Player | null> {
  try {
    const data = await get<{ player: Player }>(`/api/seasons/${seasonId}/players/${wallet}`);
    return data.player;
  } catch {
    return null;
  }
}

export async function fetchPendingAttacks(seasonId: number, defender: string): Promise<Attack[]> {
  try {
    const data = await get<{ attacks: Attack[] }>(`/api/seasons/${seasonId}/attacks/pending/${defender}`);
    return data.attacks;
  } catch {
    return [];
  }
}
