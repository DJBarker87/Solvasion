import { useState, useEffect } from 'react';
import type { Attack } from '../types';

interface RevealPromptProps {
  attacks: Attack[];
  onReveal: (attackId: number, hexId: string, attackerWallet: string) => void;
}

function formatCountdown(deadline: number): string {
  const remaining = deadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return 'EXPIRED';
  const hours = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function RevealPrompt({ attacks, onReveal }: RevealPromptProps) {
  const [, setTick] = useState(0);

  // Update countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (attacks.length === 0) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col gap-2 w-full max-w-md px-4">
      {attacks.map(atk => (
        <div
          key={atk.attack_id}
          className="bg-red-900/95 border border-red-700 rounded-lg p-3 shadow-xl backdrop-blur-sm flex items-center gap-3"
        >
          <div className="flex-1">
            <div className="text-red-200 text-sm font-medium">
              Incoming attack on hex {atk.target_hex.slice(0, 10)}...
            </div>
            <div className="text-red-400 text-xs mt-0.5">
              From {atk.attacker.slice(0, 4)}...{atk.attacker.slice(-4)}
              {atk.deadline && ` — ${formatCountdown(atk.deadline)} remaining`}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => onReveal(atk.attack_id, atk.target_hex, atk.attacker)}
              className="bg-red-600 hover:bg-red-500 text-white text-xs px-3 py-1.5 rounded cursor-pointer whitespace-nowrap"
            >
              Reveal Garrison
            </button>
            <span className="text-yellow-500/70 text-xs">
              Win or lose, your garrison is consumed and must be recommitted.
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
