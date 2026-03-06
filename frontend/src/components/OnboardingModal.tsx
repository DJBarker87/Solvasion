import { useState, useEffect } from 'react';

const STORAGE_KEY = 'solvasion:onboarded';

const STEPS = [
  {
    title: 'Connect Your Wallet',
    body: 'Click "Connect Wallet" in the top-right corner to link your Solana wallet. You need a small amount of SOL for transaction fees (rent deposits are refunded at season end).',
  },
  {
    title: 'Join the Season',
    body: 'Once connected, you\'ll see a "Join Season" prompt. Joining is free — you just pay a tiny rent deposit. You start with 100 energy to spend on claiming and defending hexes.',
  },
  {
    title: 'Claim Your First Hex',
    body: 'Click any unclaimed (grey) hex on the map, then click "Claim". Your first hex can be anywhere. After that, you can only claim hexes adjacent to territory you already own. Build outward!',
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" role="dialog" aria-modal="true">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-bold text-lg">Welcome to Solvasion</h2>
          <button onClick={handleClose} aria-label="Close" className="text-gray-500 hover:text-white text-xs cursor-pointer">
            Skip
          </button>
        </div>

        <div className="flex gap-1 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded ${i <= step ? 'bg-indigo-500' : 'bg-gray-700'}`}
            />
          ))}
        </div>

        <h3 className="text-indigo-300 font-semibold text-sm mb-2">
          Step {step + 1}: {current.title}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          {current.body}
        </p>

        <div className="flex justify-end gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="text-gray-400 hover:text-white text-sm px-4 py-2 cursor-pointer"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded cursor-pointer"
          >
            {step < STEPS.length - 1 ? 'Next' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  );
}
