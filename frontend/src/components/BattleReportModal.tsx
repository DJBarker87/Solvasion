import type { EnrichedHex } from '../types';

export interface BattleReport {
  hexId: string;
  hexName: string;
  outcome: 'AttackerWins' | 'DefenderWins' | 'Timeout';
  attackerWallet: string;
  defenderWallet: string;
  attackerCommitted: number;
  defenderRevealed: number;
  surplusReturned: number;
  refund: number;
  isAttacker: boolean;
  isDefender: boolean;
}

interface BattleReportModalProps {
  report: BattleReport;
  onClose: () => void;
  onGarrison?: (hexId: string) => void;
}

export default function BattleReportModal({ report, onClose, onGarrison }: BattleReportModalProps) {
  const won = (report.isAttacker && report.outcome === 'AttackerWins') ||
    (report.isAttacker && report.outcome === 'Timeout') ||
    (report.isDefender && report.outcome === 'DefenderWins');

  const outcomeBadge = report.outcome === 'AttackerWins' ? 'Captured'
    : report.outcome === 'DefenderWins' ? 'Defended'
    : 'Timeout';

  const badgeColor = won ? 'bg-green-600' : 'bg-red-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Battle for {report.hexName}</h2>
          <span className={`${badgeColor} text-white text-xs px-2 py-0.5 rounded-full font-medium`}>
            {won ? 'Victory' : 'Defeat'}
          </span>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Combatants */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`text-center p-2 rounded ${report.isAttacker ? 'ring-1 ring-indigo-500' : ''}`}>
              <div className="text-gray-400 text-[10px] uppercase">Attacker</div>
              <div className="text-white text-xs font-mono mt-1">
                {report.attackerWallet.slice(0, 6)}...{report.attackerWallet.slice(-4)}
              </div>
              <div className="text-yellow-300 text-sm font-semibold mt-1">{report.attackerCommitted}</div>
              <div className="text-gray-500 text-[10px]">energy committed</div>
            </div>
            <div className={`text-center p-2 rounded ${report.isDefender ? 'ring-1 ring-indigo-500' : ''}`}>
              <div className="text-gray-400 text-[10px] uppercase">Defender</div>
              <div className="text-white text-xs font-mono mt-1">
                {report.defenderWallet.slice(0, 6)}...{report.defenderWallet.slice(-4)}
              </div>
              <div className="text-yellow-300 text-sm font-semibold mt-1">
                {report.outcome === 'Timeout' ? 'Timeout' : report.defenderRevealed}
              </div>
              <div className="text-gray-500 text-[10px]">
                {report.outcome === 'Timeout' ? 'no reveal' : 'energy revealed'}
              </div>
            </div>
          </div>

          {/* Outcome badge */}
          <div className={`text-center py-2 rounded text-sm font-medium ${
            won ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
          }`}>
            {outcomeBadge}
          </div>

          {/* Details */}
          <div className="space-y-1 text-xs">
            {report.surplusReturned > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Surplus returned</span>
                <span className="text-green-400">+{report.surplusReturned} energy</span>
              </div>
            )}
            {report.refund > 0 && (
              <div className="flex justify-between text-gray-400">
                <span>Attack refund</span>
                <span className="text-green-400">+{report.refund} energy</span>
              </div>
            )}
          </div>

          {/* Post-battle advice */}
          {report.isDefender && report.outcome === 'DefenderWins' && (
            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded p-2 text-yellow-300 text-xs">
              Your garrison was consumed. Recommit now to stay protected.
              {onGarrison && (
                <button
                  onClick={() => { onGarrison(report.hexId); onClose(); }}
                  className="ml-2 bg-yellow-600 hover:bg-yellow-500 text-white px-2 py-0.5 rounded text-[10px] cursor-pointer"
                >
                  Garrison
                </button>
              )}
            </div>
          )}
          {report.isDefender && (report.outcome === 'AttackerWins' || report.outcome === 'Timeout') && (
            <div className="bg-red-900/20 border border-red-800/50 rounded p-2 text-red-300 text-xs">
              You lost this hex. Regroup and reclaim territory.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-4 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-4 py-1.5 rounded cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
