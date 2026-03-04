import type { EnrichedHex, Player } from '../types';
import { getAdjacent } from '../utils/adjacency';

interface ActionBarProps {
  hex: EnrichedHex;
  playerWallet: string | null;
  playerData: Player | null;
  ownedHexIds: Set<string>;
  seasonPhase: string | null;
  onClaim: (hexId: string) => void;
  onGarrison: (hexId: string) => void;
  onAttack: (hexId: string) => void;
}

export default function ActionBar({
  hex, playerWallet, playerData, ownedHexIds, seasonPhase,
  onClaim, onGarrison, onAttack,
}: ActionBarProps) {
  if (!playerWallet || !playerData) return null;

  const isOwned = hex.owner === playerWallet;
  const isUnclaimed = !hex.owner;
  const isEnemy = hex.owner && hex.owner !== playerWallet;

  // Check adjacency: player owns at least one hex adjacent to target
  const adjacent = getAdjacent(hex.hexId);
  const hasAdjacentOwned = ownedHexIds.size === 0 || // first claim — any hex is ok
    Array.from(adjacent).some(aid => ownedHexIds.has(aid));

  const inWar = seasonPhase === 'War' || seasonPhase === 'EscalationStage1' || seasonPhase === 'EscalationStage2';

  return (
    <div className="flex gap-2 mt-3 flex-wrap">
      {isUnclaimed && (
        <button
          onClick={() => onClaim(hex.hexId)}
          disabled={!hasAdjacentOwned}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs px-3 py-1.5 rounded cursor-pointer disabled:cursor-not-allowed"
          title={hasAdjacentOwned ? 'Claim this hex' : 'Must be adjacent to an owned hex'}
        >
          Claim
        </button>
      )}

      {isOwned && (
        <button
          onClick={() => onGarrison(hex.hexId)}
          className="bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-1.5 rounded cursor-pointer"
        >
          Garrison
        </button>
      )}

      {isEnemy && inWar && !hex.underAttack && (
        <button
          onClick={() => onAttack(hex.hexId)}
          disabled={!hasAdjacentOwned}
          className="bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs px-3 py-1.5 rounded cursor-pointer disabled:cursor-not-allowed"
          title={hasAdjacentOwned ? 'Attack this hex' : 'Must be adjacent to an owned hex'}
        >
          Attack
        </button>
      )}
    </div>
  );
}
