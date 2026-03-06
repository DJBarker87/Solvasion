import React from 'react';
import type { EnrichedHex, Player } from '../../types';
import ActionBar from '../ActionBar';
import * as ledger from '../../solana/defenceLedger';

function truncateWallet(wallet: string): string {
  return wallet.slice(0, 4) + '...' + wallet.slice(-4);
}

interface HexInfoPanelProps {
  hex: EnrichedHex | null;
  onClose: () => void;
  playerWallet: string | null;
  playerData: Player | null;
  seasonId: number | null;
  ownedHexIds: Set<string>;
  seasonPhase: string | null;
  onClaim: (hexId: string) => void;
  onGarrison: (hexId: string) => void;
  onAttack: (hexId: string) => void;
}

export default React.memo(function HexInfoPanel({
  hex, onClose, playerWallet, playerData, seasonId, ownedHexIds, seasonPhase,
  onClaim, onGarrison, onAttack,
}: HexInfoPanelProps) {
  if (!hex) return null;

  // Show garrison amount from defence ledger (own hexes only)
  const isOwned = hex.owner === playerWallet;
  const garrisonEntry = isOwned && playerWallet && seasonId
    ? ledger.getEntry(playerWallet, seasonId, hex.hexId)
    : null;

  return (
    <div className="absolute bottom-4 left-4 bg-gray-900/95 border border-gray-700 rounded-lg p-4 max-w-xs shadow-xl backdrop-blur-sm z-10">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-white font-semibold text-sm">
          {hex.landmarkName ?? (hex.regionName ? `${hex.regionName} · ${hex.hexId.slice(0, 8)}` : hex.h3Index.slice(0, 10))}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-xs ml-2 p-0 border-0 bg-transparent cursor-pointer"
        >
          X
        </button>
      </div>

      <div className="text-gray-400 text-xs space-y-1">
        <div>Region: <span className="text-gray-200">{hex.regionName}</span></div>
        <div>
          Owner:{' '}
          <span className="text-gray-200">
            {hex.owner ? truncateWallet(hex.owner) : 'Unclaimed'}
          </span>
        </div>

        {garrisonEntry && garrisonEntry.amount > 0 && (
          <div>
            Your garrison: <span className="text-green-300">{garrisonEntry.amount} energy</span>
          </div>
        )}

        {hex.owner && hex.claimedAt && (() => {
          const daysHeld = Math.floor((Date.now() / 1000 - hex.claimedAt) / 86400);
          if (daysHeld <= 0) return null;
          const bonus = Math.min(daysHeld * 10, 50);
          return (
            <div>Fortified: <span className="text-cyan-300">+{bonus}% ({daysHeld} day{daysHeld > 1 ? 's' : ''} held)</span></div>
          );
        })()}

        <div className="flex gap-2 mt-2 flex-wrap">
          {hex.isLandmark && (
            <span className="bg-yellow-900/60 text-yellow-300 text-xs px-2 py-0.5 rounded">
              Landmark
            </span>
          )}
          {hex.underAttack && (
            <span className="bg-red-900/60 text-red-300 text-xs px-2 py-0.5 rounded">
              Under Attack
            </span>
          )}
          {hex.hasCommitment && !hex.underAttack && (
            <span className="bg-green-900/60 text-green-300 text-xs px-2 py-0.5 rounded">
              Garrisoned
            </span>
          )}
          {!hex.owner && (
            <span className="bg-gray-700/60 text-gray-400 text-xs px-2 py-0.5 rounded">
              Unclaimed
            </span>
          )}
        </div>
      </div>

      {!playerWallet || !playerData ? (
        <div className="text-gray-500 text-xs mt-3">Join the season to claim hexes</div>
      ) : (
        <ActionBar
          hex={hex}
          playerWallet={playerWallet}
          playerData={playerData}
          ownedHexIds={ownedHexIds}
          seasonPhase={seasonPhase}
          onClaim={onClaim}
          onGarrison={onGarrison}
          onAttack={onAttack}
        />
      )}
    </div>
  );
});
