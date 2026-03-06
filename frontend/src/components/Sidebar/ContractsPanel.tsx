import { useEffect, useState } from 'react';

interface Contract {
  contract_id: number;
  contract_type: string;
  target_region: string | null;
  target_count: number;
  bonus_points: number;
  expires_at: number;
  current_count: number;
  completed: boolean;
}

interface Pact {
  player_a: string;
  player_b: string;
  expires_at: number;
  accepted: boolean;
  broken: boolean;
}

interface ContractsPanelProps {
  seasonId: number;
  walletStr: string;
  apiBase: string;
}

const CONTRACT_LABELS: Record<string, string> = {
  attack_region: 'Attack a hex in',
  defend_n: 'Defend attacks',
  capture_landmark: 'Capture a landmark',
  reinforce_n: 'Reinforce hexes',
  theatre_capture: 'Capture in active theatre',
};

export default function ContractsPanel({ seasonId, walletStr, apiBase }: ContractsPanelProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [pacts, setPacts] = useState<Pact[]>([]);

  useEffect(() => {
    if (!seasonId || !walletStr) return;
    const base = apiBase.replace(/\/$/, '');

    fetch(`${base}/api/seasons/${seasonId}/contracts/${walletStr}`)
      .then(r => r.ok ? r.json() : [])
      .then(setContracts)
      .catch(() => {});

    fetch(`${base}/api/seasons/${seasonId}/pacts/${walletStr}`)
      .then(r => r.ok ? r.json() : [])
      .then(setPacts)
      .catch(() => {});
  }, [seasonId, walletStr, apiBase]);

  if (contracts.length === 0 && pacts.length === 0) return null;

  return (
    <div className="border-b border-gray-800">
      {contracts.length > 0 && (
        <div className="p-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Daily Contracts
          </h3>
          <div className="space-y-2">
            {contracts.map(c => {
              const label = CONTRACT_LABELS[c.contract_type] ?? c.contract_type;
              const desc = c.target_region ? `${label} ${c.target_region}` : label;
              const pct = c.target_count > 0 ? Math.min(100, (c.current_count / c.target_count) * 100) : (c.completed ? 100 : 0);
              return (
                <div key={c.contract_id} className={`rounded p-2 text-xs ${c.completed ? 'bg-green-900/30 border border-green-800' : 'bg-gray-900/50 border border-gray-800'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-200">{desc}</span>
                    <span className="text-yellow-400">+{c.bonus_points} pts</span>
                  </div>
                  {c.target_count > 0 && (
                    <div className="w-full bg-gray-800 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${c.completed ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <div className="text-gray-500 mt-0.5">
                    {c.completed ? 'Complete!' : c.target_count > 0 ? `${c.current_count}/${c.target_count}` : 'In progress'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pacts.length > 0 && (
        <div className="p-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Active Pacts
          </h3>
          <div className="space-y-1">
            {pacts.map((p, i) => {
              const other = p.player_a === walletStr ? p.player_b : p.player_a;
              const remaining = Math.max(0, p.expires_at - Math.floor(Date.now() / 1000));
              const hours = Math.floor(remaining / 3600);
              const mins = Math.floor((remaining % 3600) / 60);
              return (
                <div key={i} className="bg-gray-900/50 border border-gray-800 rounded p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-300">
                      {p.accepted ? 'Pact' : 'Pending'} with {other.slice(0, 8)}...
                    </span>
                    <span className="text-gray-500">{hours}h {mins}m</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
