import { useState, useMemo, useEffect } from 'react';
import type { EnrichedHex, Player, Season } from '../types';
import type { MapLookups } from '../utils/mapData';
import { getAdjacent } from '../utils/adjacency';

interface AttackModalProps {
  targetHex: EnrichedHex;
  season: Season;
  playerData: Player;
  ownedHexIds: Set<string>;
  lookups: MapLookups | null;
  onAttack: (targetHexId: string, originHexId: string, energy: number) => void;
  onClose: () => void;
}

export default function AttackModal({
  targetHex, season, playerData, ownedHexIds, lookups, onAttack, onClose,
}: AttackModalProps) {
  // Find owned hexes adjacent to the target
  const adjacentToTarget = getAdjacent(targetHex.hexId);
  const originOptions = useMemo(() =>
    Array.from(adjacentToTarget).filter(id => ownedHexIds.has(id)),
    [adjacentToTarget, ownedHexIds],
  );

  const [originHexId, setOriginHexId] = useState(originOptions[0] ?? '');

  // Parse min attack energy from season config
  const config = season.config_json ? JSON.parse(season.config_json) : {};
  const minAttack = config.minAttackEnergy ?? 20;
  const available = playerData.energy_balance - playerData.energy_committed;

  const [energy, setEnergy] = useState(minAttack);

  const handleSubmit = () => {
    if (!originHexId) return;
    onAttack(targetHex.hexId, originHexId, energy);
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const hexLabel = (id: string) => {
    if (!lookups) return id.slice(0, 12) + '...';
    const landmark = lookups.landmarksByU64.get(id);
    if (landmark) return landmark.name;
    const regionId = lookups.u64ToRegionId.get(id);
    const region = regionId != null ? lookups.regionSummary.get(regionId) : undefined;
    return region ? `${region.name} · ${id.slice(0, 8)}` : id.slice(0, 12) + '...';
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="attack-title">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-80 shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <h3 id="attack-title" className="text-white font-semibold text-sm">Launch Attack</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-white text-xs cursor-pointer">X</button>
        </div>

        <div className="text-xs text-gray-400 mb-1">
          Target: <span className="text-red-300">{targetHex.landmarkName ?? targetHex.h3Index.slice(0, 10)}</span>
        </div>
        <div className="text-xs text-gray-400 mb-3">
          Defender: <span className="text-gray-200">{targetHex.owner?.slice(0, 4)}...{targetHex.owner?.slice(-4)}</span>
        </div>

        <div className="mb-3">
          <label className="text-xs text-gray-400 block mb-1">Origin hex</label>
          <select
            value={originHexId}
            onChange={e => setOriginHexId(e.target.value)}
            className="w-full bg-gray-800 text-white text-xs p-2 rounded border border-gray-700"
          >
            {originOptions.map(id => (
              <option key={id} value={id}>{hexLabel(id)}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-gray-400 mb-2">
          Available energy: <span className="text-yellow-300">{Math.max(0, available)}</span>
          {' '} (min: {minAttack})
        </div>

        <div className="mb-4">
          <input
            type="range"
            min={minAttack}
            max={Math.max(minAttack, available)}
            value={Math.min(energy, available)}
            onChange={e => setEnergy(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-center text-white text-sm mt-1">{Math.min(energy, available)}</div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!originHexId || available < minAttack}
          className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-2 rounded cursor-pointer disabled:cursor-not-allowed"
        >
          Launch Attack
        </button>
      </div>
    </div>
  );
}
