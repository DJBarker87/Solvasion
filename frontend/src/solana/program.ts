import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import idl from './idl.json';

export const PROGRAM_ID = new PublicKey('98VnxqEX7SBwLGJVAVeLSfQPEUDGwBEpQWwugvjPeAfM');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SolvasionProgram = Program<any>;

export function getProgram(wallet: AnchorWallet, connection: Connection): SolvasionProgram {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    skipPreflight: true,
  });
  return new Program(idl as any, provider) as unknown as SolvasionProgram;
}
