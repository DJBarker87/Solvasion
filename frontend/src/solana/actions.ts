// @ts-nocheck — Anchor's deep generic types cause TS2589 with Program<any>
/**
 * Transaction builders for all 7 game instructions.
 * Each function takes an Anchor program + relevant params and returns a tx signature.
 */
import { SystemProgram, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import type { SolvasionProgram } from './program';
import {
  findSeason, findSeasonCounters, findPlayer, findHex,
  findValidHexSet, findAdjacencySet, findAttack,
} from './pda';
import { createCommitment, randomBlind } from './crypto';
import * as ledger from './defenceLedger';

// ---- join_season ----

export async function joinSeason(
  program: SolvasionProgram,
  seasonId: number,
  wallet: PublicKey,
): Promise<string> {
  const [seasonPda] = findSeason(seasonId);
  const [countersPda] = findSeasonCounters(seasonId);
  const [playerPda] = findPlayer(seasonId, wallet);

  return program.methods
    .joinSeason()
    .accounts({
      playerWallet: wallet,
      season: seasonPda,
      seasonCounters: countersPda,
      player: playerPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: 'confirmed', skipPreflight: true });
}

// ---- claim_hex ----

export async function claimHex(
  program: SolvasionProgram,
  seasonId: number,
  wallet: PublicKey,
  hexId: string,
  adjacentHexId: string | null,
  nonce: number,
): Promise<string> {
  const [seasonPda] = findSeason(seasonId);
  const [countersPda] = findSeasonCounters(seasonId);
  const [playerPda] = findPlayer(seasonId, wallet);
  const [hexPda] = findHex(seasonId, hexId);
  const [vhsPda] = findValidHexSet(seasonId, 0);
  const [adjPda] = findAdjacencySet(seasonId, 0);

  // Adjacent hex PDA — if null (first claim), use program ID as placeholder
  const adjacentHexPda = adjacentHexId
    ? findHex(seasonId, adjacentHexId)[0]
    : program.programId;

  // Generate blind and commitment for the initial garrison
  const blind = randomBlind();
  const { commitment } = createCommitment(0, blind);

  const hexBN = new BN(hexId);

  const sig = await program.methods
    .claimHex(hexBN, commitment, new BN(nonce))
    .accounts({
      playerWallet: wallet,
      season: seasonPda,
      seasonCounters: countersPda,
      player: playerPda,
      hex: hexPda,
      validHexSet: vhsPda,
      adjacencySet: adjPda,
      adjacentHex: adjacentHexPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: 'confirmed', skipPreflight: true });

  // Save the blind to the defence ledger (even though amount is 0)
  ledger.setEntry(wallet.toBase58(), seasonId, {
    hexId,
    amount: 0,
    blind: ledger.bytesToHex(blind),
    nonce,
    createdAt: Date.now(),
  });

  return sig;
}

// ---- commit_defence ----

export async function commitDefence(
  program: SolvasionProgram,
  seasonId: number,
  wallet: PublicKey,
  hexIds: string[],
  amounts: number[],
  nonce: number,
): Promise<string> {
  const [seasonPda] = findSeason(seasonId);
  const [playerPda] = findPlayer(seasonId, wallet);

  const commitments: Array<{
    hexId: BN;
    commitment: number[];
    nonce: BN;
  }> = [];

  let totalDelta = 0;

  // Generate commitments and save blinds
  for (let i = 0; i < hexIds.length; i++) {
    const blind = randomBlind();
    const { commitment } = createCommitment(amounts[i], blind);
    const hexNonce = nonce + i;

    commitments.push({
      hexId: new BN(hexIds[i]),
      commitment,
      nonce: new BN(hexNonce),
    });

    totalDelta += amounts[i];

    ledger.setEntry(wallet.toBase58(), seasonId, {
      hexId: hexIds[i],
      amount: amounts[i],
      blind: ledger.bytesToHex(blind),
      nonce: hexNonce,
      createdAt: Date.now(),
    });
  }

  // Build remaining accounts (hex PDAs)
  const remainingAccounts = hexIds.map(hid => ({
    pubkey: findHex(seasonId, hid)[0],
    isSigner: false,
    isWritable: true,
  }));

  return program.methods
    .commitDefence(commitments, totalDelta)
    .accounts({
      playerWallet: wallet,
      season: seasonPda,
      player: playerPda,
    })
    .remainingAccounts(remainingAccounts)
    .rpc({ commitment: 'confirmed', skipPreflight: true });
}

// ---- increase_defence ----

export async function increaseDefence(
  program: SolvasionProgram,
  seasonId: number,
  wallet: PublicKey,
  hexId: string,
  newTotalAmount: number,
  delta: number,
  nonce: number,
): Promise<string> {
  const [seasonPda] = findSeason(seasonId);
  const [playerPda] = findPlayer(seasonId, wallet);
  const [hexPda] = findHex(seasonId, hexId);

  const blind = randomBlind();
  const { commitment } = createCommitment(newTotalAmount, blind);

  const sig = await program.methods
    .increaseDefence(new BN(hexId), commitment, new BN(nonce), delta)
    .accounts({
      playerWallet: wallet,
      season: seasonPda,
      player: playerPda,
      hex: hexPda,
    })
    .rpc({ commitment: 'confirmed', skipPreflight: true });

  ledger.setEntry(wallet.toBase58(), seasonId, {
    hexId,
    amount: newTotalAmount,
    blind: ledger.bytesToHex(blind),
    nonce,
    createdAt: Date.now(),
  });

  return sig;
}

// ---- withdraw_defence ----

export async function withdrawDefence(
  program: SolvasionProgram,
  seasonId: number,
  wallet: PublicKey,
  hexId: string,
): Promise<string> {
  const entry = ledger.getEntry(wallet.toBase58(), seasonId, hexId);
  if (!entry) throw new Error('No defence ledger entry for this hex — cannot reveal blind');

  const [seasonPda] = findSeason(seasonId);
  const [playerPda] = findPlayer(seasonId, wallet);
  const [hexPda] = findHex(seasonId, hexId);

  const blindBytes = ledger.hexToBytes(entry.blind);

  const sig = await program.methods
    .withdrawDefence(new BN(hexId), entry.amount, Array.from(blindBytes))
    .accounts({
      playerWallet: wallet,
      season: seasonPda,
      player: playerPda,
      hex: hexPda,
    })
    .rpc({ commitment: 'confirmed', skipPreflight: true });

  // Remove ledger entry on success
  ledger.removeEntry(wallet.toBase58(), seasonId, hexId);

  return sig;
}

// ---- launch_attack ----

export async function launchAttack(
  program: SolvasionProgram,
  seasonId: number,
  wallet: PublicKey,
  targetHexId: string,
  originHexId: string,
  energy: number,
  defenderWallet: PublicKey,
  nextAttackId: number,
): Promise<string> {
  const [seasonPda] = findSeason(seasonId);
  const [countersPda] = findSeasonCounters(seasonId);
  const [attackerPda] = findPlayer(seasonId, wallet);
  const [defenderPda] = findPlayer(seasonId, defenderWallet);
  const [targetHexPda] = findHex(seasonId, targetHexId);
  const [originHexPda] = findHex(seasonId, originHexId);
  const [adjPda] = findAdjacencySet(seasonId, 0);
  const [attackPda] = findAttack(seasonId, nextAttackId);

  return program.methods
    .launchAttack(new BN(targetHexId), new BN(originHexId), energy, 0)
    .accounts({
      playerWallet: wallet,
      season: seasonPda,
      seasonCounters: countersPda,
      playerAttacker: attackerPda,
      playerDefender: defenderPda,
      hexTarget: targetHexPda,
      hexOrigin: originHexPda,
      adjacencySet: adjPda,
      attack: attackPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc({ commitment: 'confirmed', skipPreflight: true });
}

// ---- reveal_defence ----

export async function revealDefence(
  program: SolvasionProgram,
  seasonId: number,
  wallet: PublicKey,
  attackId: number,
  hexId: string,
  attackerWallet: PublicKey,
): Promise<string> {
  const entry = ledger.getEntry(wallet.toBase58(), seasonId, hexId);
  if (!entry) throw new Error('No defence ledger entry — cannot reveal blind');

  const [seasonPda] = findSeason(seasonId);
  const [defenderPda] = findPlayer(seasonId, wallet);
  const [attackerPda] = findPlayer(seasonId, attackerWallet);
  const [hexPda] = findHex(seasonId, hexId);
  const [attackPda] = findAttack(seasonId, attackId);

  const blindBytes = ledger.hexToBytes(entry.blind);

  const sig = await program.methods
    .revealDefence(new BN(attackId), entry.amount, Array.from(blindBytes))
    .accounts({
      caller: wallet,
      season: seasonPda,
      playerDefender: defenderPda,
      playerAttacker: attackerPda,
      hex: hexPda,
      attack: attackPda,
      attackerRentRecipient: attackerWallet,
    })
    .rpc({ commitment: 'confirmed', skipPreflight: true });

  // Commitment is consumed on any reveal — remove ledger entry
  ledger.removeEntry(wallet.toBase58(), seasonId, hexId);

  return sig;
}
