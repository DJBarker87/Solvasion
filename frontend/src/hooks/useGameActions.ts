import { useState, useCallback, useMemo } from 'react';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getProgram } from '../solana/program';
import * as actions from '../solana/actions';
import * as ledger from '../solana/defenceLedger';
import type { TxStatus } from '../components/TxToast';
import type { UseGuardianResult } from './useGuardian';

interface UseGameActionsResult {
  tx: TxStatus | null;
  clearTx: () => void;
  joinSeason: (seasonId: number) => Promise<void>;
  claimHex: (seasonId: number, hexId: string, adjacentHexId: string | null) => Promise<void>;
  commitDefence: (seasonId: number, hexIds: string[], amounts: number[]) => Promise<void>;
  increaseDefence: (seasonId: number, hexId: string, newTotal: number, delta: number) => Promise<void>;
  withdrawDefence: (seasonId: number, hexId: string) => Promise<void>;
  launchAttack: (seasonId: number, targetHexId: string, originHexId: string, energy: number, defenderWallet: string, nextAttackId: number) => Promise<void>;
  revealDefence: (seasonId: number, attackId: number, hexId: string, attackerWallet: string) => Promise<void>;
}

export function useGameActions(onSuccess?: () => void, guardian?: UseGuardianResult): UseGameActionsResult {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const [tx, setTx] = useState<TxStatus | null>(null);

  const clearTx = useCallback(() => setTx(null), []);

  // Get next nonce from player's defence ledger
  const getNextNonce = useCallback((seasonId: number): number => {
    if (!publicKey) return 1;
    const entries = ledger.getAll(publicKey.toBase58(), seasonId);
    const maxNonce = entries.reduce((max, e) => Math.max(max, e.nonce), 0);
    return maxNonce + 1;
  }, [publicKey]);

  const wrap = useCallback(async (label: string, fn: () => Promise<string>) => {
    if (!wallet || !publicKey) {
      setTx({ state: 'error', message: 'Wallet not connected' });
      return;
    }
    setTx({ state: 'pending', message: label });
    try {
      const sig = await fn();
      setTx({ state: 'confirmed', message: label, signature: sig });
      onSuccess?.();
    } catch (err: any) {
      const msg = err?.message?.slice(0, 200) ?? 'Unknown error';
      setTx({ state: 'error', message: msg });
    }
  }, [wallet, publicKey, onSuccess]);

  const program = useMemo(() => {
    if (!wallet) return null;
    return getProgram(wallet, connection);
  }, [wallet, connection]);

  return {
    tx,
    clearTx,

    joinSeason: useCallback(async (seasonId: number) => {
      await wrap('Joining season...', () =>
        actions.joinSeason(program!, seasonId, publicKey!));
    }, [wrap, program, publicKey]),

    claimHex: useCallback(async (seasonId: number, hexId: string, adjacentHexId: string | null) => {
      const nonce = getNextNonce(seasonId);
      await wrap('Claiming hex...', async () => {
        const sig = await actions.claimHex(program!, seasonId, publicKey!, hexId, adjacentHexId, nonce);
        // Fire-and-forget Guardian upload
        if (guardian?.enabled) {
          const entry = ledger.getEntry(publicKey!.toBase58(), seasonId, hexId);
          if (entry) {
            guardian.uploadPacket(seasonId, hexId, entry.amount, entry.blind, entry.nonce).catch(err =>
              console.warn('Guardian upload failed:', err));
          }
        }
        return sig;
      });
    }, [wrap, program, publicKey, getNextNonce, guardian]),

    commitDefence: useCallback(async (seasonId: number, hexIds: string[], amounts: number[]) => {
      const nonce = getNextNonce(seasonId);
      await wrap('Setting garrison...', async () => {
        const sig = await actions.commitDefence(program!, seasonId, publicKey!, hexIds, amounts, nonce);
        if (guardian?.enabled) {
          for (let i = 0; i < hexIds.length; i++) {
            const entry = ledger.getEntry(publicKey!.toBase58(), seasonId, hexIds[i]);
            if (entry) {
              guardian.uploadPacket(seasonId, hexIds[i], entry.amount, entry.blind, entry.nonce).catch(err =>
                console.warn('Guardian upload failed:', err));
            }
          }
        }
        return sig;
      });
    }, [wrap, program, publicKey, getNextNonce, guardian]),

    increaseDefence: useCallback(async (seasonId: number, hexId: string, newTotal: number, delta: number) => {
      const nonce = getNextNonce(seasonId);
      await wrap('Increasing garrison...', async () => {
        const sig = await actions.increaseDefence(program!, seasonId, publicKey!, hexId, newTotal, delta, nonce);
        if (guardian?.enabled) {
          const entry = ledger.getEntry(publicKey!.toBase58(), seasonId, hexId);
          if (entry) {
            guardian.uploadPacket(seasonId, hexId, entry.amount, entry.blind, entry.nonce).catch(err =>
              console.warn('Guardian upload failed:', err));
          }
        }
        return sig;
      });
    }, [wrap, program, publicKey, getNextNonce, guardian]),

    withdrawDefence: useCallback(async (seasonId: number, hexId: string) => {
      await wrap('Withdrawing garrison...', () =>
        actions.withdrawDefence(program!, seasonId, publicKey!, hexId));
    }, [wrap, program, publicKey]),

    launchAttack: useCallback(async (seasonId: number, targetHexId: string, originHexId: string, energy: number, defenderWallet: string, nextAttackId: number) => {
      await wrap('Launching attack...', () =>
        actions.launchAttack(program!, seasonId, publicKey!, targetHexId, originHexId, energy, new PublicKey(defenderWallet), nextAttackId));
    }, [wrap, program, publicKey]),

    revealDefence: useCallback(async (seasonId: number, attackId: number, hexId: string, attackerWallet: string) => {
      await wrap('Revealing garrison...', () =>
        actions.revealDefence(program!, seasonId, publicKey!, attackId, hexId, new PublicKey(attackerWallet)));
    }, [wrap, program, publicKey]),
  };
}
