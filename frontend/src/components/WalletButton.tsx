import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';

function truncate(s: string): string {
  return s.slice(0, 4) + '...' + s.slice(-4);
}

function getNetwork(): string {
  const rpc = import.meta.env.VITE_RPC_URL ?? '';
  if (rpc.includes('mainnet')) return 'Mainnet';
  return 'Devnet';
}

export default function WalletButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }
    connection.getBalance(publicKey).then(lamports => {
      setBalance(lamports / 1e9);
    }).catch(() => setBalance(null));
  }, [connected, publicKey, connection]);

  const network = getNetwork();

  if (connected && publicKey) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-xs font-mono">
            {truncate(publicKey.toBase58())}
          </span>
          <button
            onClick={() => disconnect()}
            className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer"
          >
            Disconnect
          </button>
        </div>
        <div className="text-gray-500 text-[10px]">
          {balance !== null ? `${balance.toFixed(2)} SOL` : '...'} · {network}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-1.5 rounded cursor-pointer"
    >
      Connect Wallet
    </button>
  );
}
