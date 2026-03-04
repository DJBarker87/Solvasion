import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

function truncate(s: string): string {
  return s.slice(0, 4) + '...' + s.slice(-4);
}

export default function WalletButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
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
