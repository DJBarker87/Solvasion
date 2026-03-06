import { useState } from 'react';
import type { Season } from '../../types';

const PHASE_COLORS: Record<string, string> = {
  LandRush: 'bg-blue-900 text-blue-300',
  War: 'bg-red-900 text-red-300',
  EscalationStage1: 'bg-orange-900 text-orange-300',
  EscalationStage2: 'bg-red-800 text-red-200',
  Ended: 'bg-gray-700 text-gray-300',
};

const PHASE_EXPLANATIONS: Record<string, string> = {
  LandRush: 'Claim unclaimed hexes. No attacks allowed.',
  War: 'Attacks are open. Defend your territory.',
  EscalationStage1: '1.5x energy generation. Attacks cost less.',
  EscalationStage2: '2x energy generation. Final push for victory.',
  Ended: 'Season complete. Winner declared.',
};

function formatCountdown(targetTs: number | null): string {
  if (!targetTs) return '--';
  const diff = targetTs - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'Now';
  const hours = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}

function nextPhaseTimestamp(season: Season): number | null {
  switch (season.phase) {
    case 'LandRush': return season.war_start;
    case 'War': return season.escalation_start;
    case 'EscalationStage1': return season.season_end;
    case 'EscalationStage2': return season.season_end;
    default: return null;
  }
}

interface SeasonInfoProps {
  season: Season | null;
}

export default function SeasonInfo({ season }: SeasonInfoProps) {
  const [showPhaseHelp, setShowPhaseHelp] = useState(false);

  if (!season) {
    return (
      <div className="p-4">
        <p className="text-gray-400 text-sm">No active season. Check back soon!</p>
      </div>
    );
  }

  const phaseClass = PHASE_COLORS[season.phase] ?? 'bg-gray-700 text-gray-300';
  const next = nextPhaseTimestamp(season);

  return (
    <div className="p-4 border-b border-gray-800">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-white font-bold text-sm">Season {season.season_id}</h2>
        <span className={`text-xs px-2 py-0.5 rounded ${phaseClass}`}>
          {season.phase}
        </span>
        <button
          onClick={() => setShowPhaseHelp(!showPhaseHelp)}
          className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
          aria-label="Phase explanation"
        >
          [?]
        </button>
      </div>

      {showPhaseHelp && (
        <div className="text-xs text-gray-400 bg-gray-800/60 rounded p-2 mb-3">
          {PHASE_EXPLANATIONS[season.phase] ?? 'Unknown phase.'}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="text-gray-400">
          Players: <span className="text-gray-200">{season.player_count}</span>
        </div>
        <div className="text-gray-400">
          Hexes: <span className="text-gray-200">{season.total_hexes}</span>
        </div>
        <div className="text-gray-400">
          Victory: <span className="text-gray-200">{season.victory_threshold?.toLocaleString() ?? '--'}</span>
        </div>
        {next && (
          <div className="text-gray-400">
            Next phase: <span className="text-gray-200">{formatCountdown(next)}</span>
          </div>
        )}
      </div>

      {season.winner && (
        <div className="mt-2 text-xs text-yellow-400">
          Winner: {season.winner.slice(0, 4)}...{season.winner.slice(-4)} ({season.winning_score?.toLocaleString()} pts)
        </div>
      )}
    </div>
  );
}
