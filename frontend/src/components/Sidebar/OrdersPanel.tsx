import { useState, useEffect, useMemo } from 'react';
import type { Attack, EnrichedHex, Season, Player } from '../../types';
import type { MapLookups } from '../../utils/mapData';
import { getAdjacent } from '../../utils/adjacency';

interface OrdersPanelProps {
  hexes: EnrichedHex[];
  playerData: Player;
  season: Season;
  pendingAttacks: Attack[];
  lookups: MapLookups | null;
  walletStr: string;
  onReveal: (attackId: number, hexId: string, attackerWallet: string) => void;
  onGarrison: (hexId: string) => void;
  onAttack: (hexId: string) => void;
}

function formatCountdown(deadline: number): string {
  const remaining = deadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return 'EXPIRED';
  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function OrdersPanel({
  hexes, playerData, season, pendingAttacks, lookups, walletStr,
  onReveal, onGarrison, onAttack,
}: OrdersPanelProps) {
  const [, setTick] = useState(0);

  // Tick for countdown updates
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Player's owned hexes
  const ownedHexes = useMemo(
    () => hexes.filter(h => h.owner === walletStr),
    [hexes, walletStr],
  );

  // Hexes needing recommitment
  const needsGarrison = useMemo(
    () => ownedHexes.filter(h => !h.hasCommitment && !h.underAttack),
    [ownedHexes],
  );

  // Player's landmark hexes adjacent to enemy territory
  const landmarksAtRisk = useMemo(() => {
    return ownedHexes.filter(h => {
      if (!h.isLandmark) return false;
      const neighbors = getAdjacent(h.hexId);
      for (const nId of neighbors) {
        const n = hexes.find(x => x.hexId === nId);
        if (n && n.owner && n.owner !== walletStr) return true;
      }
      return false;
    });
  }, [ownedHexes, hexes, walletStr]);

  // Suggested targets: enemy hexes adjacent to player territory with no commitment
  const suggestedTargets = useMemo(() => {
    const ownedSet = new Set(ownedHexes.map(h => h.hexId));
    const candidates: EnrichedHex[] = [];
    const seen = new Set<string>();

    for (const owned of ownedHexes) {
      const neighbors = getAdjacent(owned.hexId);
      for (const nId of neighbors) {
        if (ownedSet.has(nId) || seen.has(nId)) continue;
        seen.add(nId);
        const n = hexes.find(x => x.hexId === nId);
        if (n && n.owner && n.owner !== walletStr && !n.hasCommitment && !n.underAttack) {
          candidates.push(n);
        }
      }
    }
    return candidates.slice(0, 3);
  }, [ownedHexes, hexes, walletStr]);

  // Active theatre info
  const hasTheatre = season.config_json ? (() => {
    try {
      const cfg = JSON.parse(season.config_json);
      return cfg.active_theatres?.some((t: number) => t > 0) ?? false;
    } catch { return false; }
  })() : false;

  const hasOrders = pendingAttacks.length > 0 || needsGarrison.length > 0 ||
    landmarksAtRisk.length > 0 || suggestedTargets.length > 0;

  if (!hasOrders) return null;

  const hexName = (h: EnrichedHex) => h.landmarkName ?? h.regionName ?? `hex ${h.hexId.slice(0, 8)}`;

  return (
    <div className="border-b border-gray-800 p-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Orders</h3>

      {/* Reveals Due */}
      {pendingAttacks.length > 0 && (
        <div className="mb-2">
          {pendingAttacks.map(atk => {
            const hex = hexes.find(h => h.hexId === atk.target_hex);
            const name = hex ? hexName(hex) : atk.target_hex.slice(0, 10);
            return (
              <div key={atk.attack_id} className="bg-red-900/40 border border-red-800 rounded p-2 mb-1 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-red-200 text-xs font-medium truncate">Reveal {name}</div>
                  <div className="text-red-400 text-[10px]">
                    {atk.deadline ? formatCountdown(atk.deadline) : ''}
                  </div>
                </div>
                <button
                  onClick={() => onReveal(atk.attack_id, atk.target_hex, atk.attacker)}
                  className="bg-red-600 hover:bg-red-500 text-white text-[10px] px-2 py-1 rounded cursor-pointer whitespace-nowrap"
                >
                  Reveal
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Recommit Garrison */}
      {needsGarrison.length > 0 && (
        <div className="mb-2">
          <div className="text-yellow-400 text-[10px] font-medium mb-1">Ungarrisoned ({needsGarrison.length})</div>
          {needsGarrison.slice(0, 5).map(h => (
            <div key={h.hexId} className="flex items-center gap-2 py-0.5">
              <span className="text-gray-300 text-[10px] truncate flex-1">{hexName(h)}</span>
              <button
                onClick={() => onGarrison(h.hexId)}
                className="text-yellow-400 hover:text-yellow-300 text-[10px] cursor-pointer"
              >
                Garrison
              </button>
            </div>
          ))}
          {needsGarrison.length > 5 && (
            <div className="text-gray-500 text-[10px]">+{needsGarrison.length - 5} more</div>
          )}
        </div>
      )}

      {/* Landmarks at Risk */}
      {landmarksAtRisk.length > 0 && (
        <div className="mb-2">
          <div className="text-orange-400 text-[10px] font-medium mb-1">Landmarks at Risk</div>
          {landmarksAtRisk.map(h => (
            <div key={h.hexId} className="flex items-center gap-2 py-0.5">
              <span className="text-orange-300 text-[10px] truncate flex-1">{hexName(h)}</span>
              <button
                onClick={() => onGarrison(h.hexId)}
                className="text-orange-400 hover:text-orange-300 text-[10px] cursor-pointer"
              >
                Garrison
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Suggested Targets */}
      {suggestedTargets.length > 0 && (
        <div>
          <div className="text-blue-400 text-[10px] font-medium mb-1">Suggested Targets</div>
          {suggestedTargets.map(h => (
            <div key={h.hexId} className="flex items-center gap-2 py-0.5">
              <span className="text-gray-300 text-[10px] truncate flex-1">
                {hexName(h)} <span className="text-gray-500">({h.owner?.slice(0, 6)}...)</span>
              </span>
              <button
                onClick={() => onAttack(h.hexId)}
                className="text-blue-400 hover:text-blue-300 text-[10px] cursor-pointer"
              >
                Attack
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
