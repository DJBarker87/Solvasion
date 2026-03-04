import { useState } from 'react';
import type { Player } from '../types';
import * as ledger from '../solana/defenceLedger';

interface GarrisonModalProps {
  hexId: string;
  seasonId: number;
  wallet: string;
  playerData: Player;
  onCommit: (hexIds: string[], amounts: number[]) => void;
  onIncrease: (hexId: string, newTotal: number, delta: number) => void;
  onWithdraw: (hexId: string) => void;
  onClose: () => void;
}

export default function GarrisonModal({
  hexId, seasonId, wallet, playerData, onCommit, onIncrease, onWithdraw, onClose,
}: GarrisonModalProps) {
  const entry = ledger.getEntry(wallet, seasonId, hexId);
  const currentAmount = entry?.amount ?? 0;
  const hasGarrison = currentAmount > 0;

  // Available energy (approximation — backend data may lag)
  const available = playerData.energy_balance - playerData.energy_committed;

  const [amount, setAmount] = useState(hasGarrison ? 10 : 30);
  const [mode, setMode] = useState<'set' | 'increase' | 'withdraw'>(hasGarrison ? 'increase' : 'set');

  const maxEnergy = Math.min(available, 500);

  const handleSubmit = () => {
    if (mode === 'withdraw') {
      onWithdraw(hexId);
    } else if (mode === 'set') {
      onCommit([hexId], [amount]);
    } else {
      // increase: new total = current + delta
      onIncrease(hexId, currentAmount + amount, amount);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 w-80 shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-white font-semibold text-sm">
            {hasGarrison ? 'Garrison' : 'Set Garrison'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xs cursor-pointer">X</button>
        </div>

        {hasGarrison && (
          <div className="text-xs text-gray-400 mb-3">
            Current garrison: <span className="text-green-300">{currentAmount} energy</span>
          </div>
        )}

        <div className="text-xs text-gray-400 mb-2">
          Available energy: <span className="text-yellow-300">{Math.max(0, available)}</span>
        </div>

        {hasGarrison && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setMode('increase')}
              className={`text-xs px-2 py-1 rounded cursor-pointer ${mode === 'increase' ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              Increase
            </button>
            <button
              onClick={() => setMode('withdraw')}
              className={`text-xs px-2 py-1 rounded cursor-pointer ${mode === 'withdraw' ? 'bg-red-700 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              Withdraw
            </button>
          </div>
        )}

        {mode !== 'withdraw' && (
          <div className="mb-4">
            <label className="text-xs text-gray-400 block mb-1">
              {mode === 'increase' ? 'Add energy' : 'Garrison energy'}
            </label>
            <input
              type="range"
              min={1}
              max={Math.max(1, maxEnergy)}
              value={Math.min(amount, maxEnergy)}
              onChange={e => setAmount(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-center text-white text-sm mt-1">{Math.min(amount, maxEnergy)}</div>
          </div>
        )}

        {mode === 'withdraw' && (
          <p className="text-xs text-red-300 mb-4">
            This will reveal your garrison amount and withdraw all {currentAmount} energy.
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={mode !== 'withdraw' && maxEnergy <= 0}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm py-2 rounded cursor-pointer disabled:cursor-not-allowed"
        >
          {mode === 'withdraw' ? 'Withdraw Garrison' : mode === 'increase' ? 'Increase Garrison' : 'Set Garrison'}
        </button>
      </div>
    </div>
  );
}
