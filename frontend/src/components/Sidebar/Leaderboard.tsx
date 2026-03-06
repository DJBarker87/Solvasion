import React from 'react';
import type { Player } from '../../types';

interface LeaderboardProps {
  players: Player[];
}

export default React.memo(function Leaderboard({ players }: LeaderboardProps) {
  if (players.length === 0) {
    return (
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-gray-400 text-xs font-semibold uppercase mb-2">Leaderboard</h3>
        <p className="text-gray-600 text-xs">No players have joined yet</p>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-gray-800">
      <h3 className="text-gray-400 text-xs font-semibold uppercase mb-2">Leaderboard</h3>
      <div className="space-y-1">
        {players.map((p, i) => (
          <div key={p.wallet} className="flex items-center text-xs gap-2">
            <span className="text-gray-500 w-4 text-right">{i + 1}</span>
            <span className="text-gray-200 flex-1 truncate font-mono text-[11px]">
              {p.wallet.slice(0, 4)}...{p.wallet.slice(-4)}
            </span>
            <span className="text-gray-400">{p.hex_count}h</span>
            <span className="text-white font-medium w-12 text-right">{p.points.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
