import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export function findGlobalConfig(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    programId
  );
}

export function findSeason(programId: PublicKey, seasonId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("season"), seasonId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function findSeasonCounters(programId: PublicKey, seasonId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("season_counters"), seasonId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function findPlayer(programId: PublicKey, seasonId: BN, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), seasonId.toArrayLike(Buffer, "le", 8), wallet.toBuffer()],
    programId
  );
}

export function findHex(programId: PublicKey, seasonId: BN, hexId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("hex"), seasonId.toArrayLike(Buffer, "le", 8), hexId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function findAttack(programId: PublicKey, seasonId: BN, attackId: BN): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("attack"), seasonId.toArrayLike(Buffer, "le", 8), attackId.toArrayLike(Buffer, "le", 8)],
    programId
  );
}

export function findReputation(programId: PublicKey, wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reputation"), wallet.toBuffer()],
    programId
  );
}

export function findPhantomRecovery(
  programId: PublicKey, seasonId: BN, wallet: PublicKey, hexId: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("phantom"),
      seasonId.toArrayLike(Buffer, "le", 8),
      wallet.toBuffer(),
      hexId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}
