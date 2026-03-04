import { useEffect } from 'react';

export interface TxStatus {
  state: 'pending' | 'confirmed' | 'error';
  message: string;
  signature?: string;
}

interface TxToastProps {
  tx: TxStatus | null;
  onDismiss: () => void;
}

const EXPLORER = 'https://explorer.solana.com/tx';

export default function TxToast({ tx, onDismiss }: TxToastProps) {
  // Auto-dismiss after 6s on confirmed
  useEffect(() => {
    if (tx?.state === 'confirmed') {
      const id = setTimeout(onDismiss, 6000);
      return () => clearTimeout(id);
    }
  }, [tx, onDismiss]);

  if (!tx) return null;

  const bg = tx.state === 'pending'
    ? 'bg-blue-900/90 border-blue-700'
    : tx.state === 'confirmed'
    ? 'bg-green-900/90 border-green-700'
    : 'bg-red-900/90 border-red-700';

  const textColor = tx.state === 'pending'
    ? 'text-blue-200'
    : tx.state === 'confirmed'
    ? 'text-green-200'
    : 'text-red-200';

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${bg} border rounded-lg p-3 shadow-xl max-w-sm`}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className={`text-sm font-medium ${textColor}`}>
            {tx.state === 'pending' && 'Sending transaction...'}
            {tx.state === 'confirmed' && 'Transaction confirmed'}
            {tx.state === 'error' && 'Transaction failed'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">{tx.message}</div>
          {tx.signature && (
            <a
              href={`${EXPLORER}/${tx.signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
            >
              View on Explorer
            </a>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-white text-xs cursor-pointer"
        >
          X
        </button>
      </div>
    </div>
  );
}
