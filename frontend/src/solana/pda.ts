import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

const PROGRAM_ID = new PublicKey('98VnxqEX7SBwLGJVAVeLSfQPEUDGwBEpQWwugvjPeAfM');

function u64Le(n: BN | number): Buffer {
  const bn = typeof n === 'number' ? new BN(n) : n;
  return bn.toArrayLike(Buffer, 'le', 8);
}

export function findGlobalConfig(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('global_config')],
    PROGRAM_ID,
  );
}

export function findSeason(seasonId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('season'), u64Le(seasonId)],
    PROGRAM_ID,
  );
}

export function findSeasonCounters(seasonId: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('season_counters'), u64Le(seasonId)],
    PROGRAM_ID,
  );
}

export function findPlayer(seasonId: number, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('player'), u64Le(seasonId), wallet.toBuffer()],
    PROGRAM_ID,
  );
}

export function findHex(seasonId: number, hexId: string | BN): [PublicKey, number] {
  const bn = typeof hexId === 'string' ? new BN(hexId) : hexId;
  return PublicKey.findProgramAddressSync(
    [Buffer.from('hex'), u64Le(seasonId), u64Le(bn)],
    PROGRAM_ID,
  );
}

export function findAttack(seasonId: number, attackId: number | BN): [PublicKey, number] {
  const bn = typeof attackId === 'number' ? new BN(attackId) : attackId;
  return PublicKey.findProgramAddressSync(
    [Buffer.from('attack'), u64Le(seasonId), u64Le(bn)],
    PROGRAM_ID,
  );
}

export function findValidHexSet(seasonId: number, chunkIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('valid_hexes'), u64Le(seasonId), Buffer.from([chunkIndex])],
    PROGRAM_ID,
  );
}

export function findAdjacencySet(seasonId: number, chunkIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('adjacency'), u64Le(seasonId), Buffer.from([chunkIndex])],
    PROGRAM_ID,
  );
}

export function findReputation(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('reputation'), wallet.toBuffer()],
    PROGRAM_ID,
  );
}
