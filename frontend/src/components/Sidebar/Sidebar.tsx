import { useState, type ReactNode } from 'react';
import type { Season, Player, FeedItem, Attack, EnrichedHex } from '../../types';
import type { MapLookups } from '../../utils/mapData';
import SeasonInfo from './SeasonInfo';
import Leaderboard from './Leaderboard';
import WarFeed from './WarFeed';
import OrdersPanel from './OrdersPanel';
import ContractsPanel from './ContractsPanel';
import WalletButton from '../WalletButton';

interface SidebarProps {
  season: Season | null;
  players: Player[];
  feedItems: FeedItem[];
  playerData?: Player | null;
  children?: ReactNode;
  onToggle?: (open: boolean) => void;
  connected?: boolean;
  guardianEnabled?: boolean;
  onGuardianToggle?: () => void;
  guardianSyncedCount?: number;
  guardianTotalHexes?: number;
  onGuardianSyncAll?: () => void;
  // Orders panel props
  hexes?: EnrichedHex[];
  pendingAttacks?: Attack[];
  lookups?: MapLookups | null;
  walletStr?: string | null;
  onReveal?: (attackId: number, hexId: string, attackerWallet: string) => void;
  onGarrison?: (hexId: string) => void;
  onAttack?: (hexId: string) => void;
  apiBase?: string;
}

export default function Sidebar({
  season, players, feedItems, playerData, children, onToggle, connected,
  guardianEnabled, onGuardianToggle, guardianSyncedCount, guardianTotalHexes, onGuardianSyncAll,
  hexes, pendingAttacks, lookups, walletStr, onReveal, onGarrison, onAttack, apiBase,
}: SidebarProps) {
  const [open, setOpen] = useState(true);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={toggle}
        className="md:hidden fixed top-4 right-4 z-30 bg-gray-800 border border-gray-700 text-white w-10 h-10 rounded flex items-center justify-center text-lg shadow-lg"
      >
        {open ? '\u2715' : '\u2630'}
      </button>

      {/* Sidebar panel */}
      <div
        className={`
          fixed md:relative top-0 right-0 h-full z-20
          bg-gray-950 border-l border-gray-800
          w-72 flex flex-col
          transition-transform duration-200
          ${open ? 'translate-x-0' : 'translate-x-full md:translate-x-0 md:w-0 md:border-0 md:overflow-hidden'}
        `}
      >
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-white font-bold text-lg tracking-wide">
              SOLVASION
              <span
                className={`inline-block w-2 h-2 rounded-full ml-2 align-middle ${
                  connected ? 'bg-green-400' : 'bg-yellow-400'
                }`}
                title={connected ? 'Live' : 'Reconnecting...'}
              />
            </h1>
          </div>
          <p className="text-gray-500 text-xs mb-2">Territory Conquest on Solana</p>
          <WalletButton />
          {!playerData && !children && (
            <div className="mt-3 bg-gray-900/60 border border-gray-800 rounded-lg p-3 text-xs text-gray-400 space-y-2">
              <p className="text-gray-200 font-medium text-sm">Conquer Europe, hex by hex.</p>
              <p>
                Solvasion is a fully on-chain territory game on Solana. Claim hexes, hide your garrison strength with cryptographic commitments, and battle for control of the map.
              </p>
              <p className="text-gray-500">
                Connecting your wallet lets you view your territory and join a season. All game actions are Solana transactions — your wallet signs each one. We never have access to your funds.
              </p>
              <ul className="text-gray-500 space-y-1">
                <li>&#x2713; Free to play — no token, no entry fee</li>
                <li>&#x2713; You only pay tiny Solana tx fees (~0.00001 SOL)</li>
                <li>&#x2713; Rent deposits are fully refunded at season end</li>
                <li>&#x2713; Open source — <a href="https://github.com/DJBarker87/Solvasion" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">view the code</a></li>
              </ul>
              <p className="text-yellow-500/80 border-t border-gray-800 pt-2">
                We recommend using a fresh wallet for extra security. Just load it with a small amount of SOL for transaction fees and an NFT you want as your banner.
              </p>
            </div>
          )}
          {playerData && (
            <div className="mt-2 flex gap-3 text-xs text-gray-400">
              <span>Energy: <span className="text-yellow-300">{playerData.energy_balance}</span></span>
              <span>Hexes: <span className="text-blue-300">{playerData.hex_count}</span></span>
              <span>Points: <span className="text-green-300">{playerData.points.toLocaleString()}</span></span>
            </div>
          )}
          {playerData && onGuardianToggle && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <span>Guardian:</span>
              <button
                onClick={onGuardianToggle}
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  guardianEnabled
                    ? 'bg-green-700 text-green-100'
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                {guardianEnabled ? 'ON' : 'OFF'}
              </button>
              {guardianEnabled && (
                <>
                  <span>{guardianSyncedCount ?? 0}/{guardianTotalHexes ?? 0} synced</span>
                  {onGuardianSyncAll && (
                    <button
                      onClick={onGuardianSyncAll}
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Sync All
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {children}
        {playerData && season && hexes && walletStr && onReveal && onGarrison && onAttack && (
          <OrdersPanel
            hexes={hexes}
            playerData={playerData}
            season={season}
            pendingAttacks={pendingAttacks ?? []}
            lookups={lookups ?? null}
            walletStr={walletStr}
            onReveal={onReveal}
            onGarrison={onGarrison}
            onAttack={onAttack}
          />
        )}
        {playerData && season && walletStr && apiBase && (
          <ContractsPanel
            seasonId={season.season_id}
            walletStr={walletStr}
            apiBase={apiBase}
          />
        )}
        <SeasonInfo season={season} />
        <Leaderboard players={players} />
        <WarFeed items={feedItems} />
      </div>
    </>
  );
}
