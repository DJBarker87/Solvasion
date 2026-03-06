export function attackAlert(params: {
  hexName: string;
  attackerWallet: string;
  attackerEnergy: number;
  deadlineUtc: string;
  timeRemaining: string;
}): string {
  return [
    `\u26a0\ufe0f INCOMING ATTACK on ${params.hexName}`,
    `Attacker: ${params.attackerWallet.slice(0, 6)}...${params.attackerWallet.slice(-4)} committed ${params.attackerEnergy} energy`,
    `Your garrison: committed (amount hidden)`,
    `Deadline: ${params.deadlineUtc} (${params.timeRemaining} remaining)`,
    ``,
    `If you don't reveal, your garrison is treated as 0.`,
    `\u2192 Open Solvasion to reveal`,
  ].join('\n');
}

export function countdownReminder(params: {
  hexName: string;
  timeRemaining: string;
}): string {
  return [
    `\u23f0 REMINDER: ${params.hexName} under attack!`,
    `Only ${params.timeRemaining} remaining to reveal your garrison.`,
    `\u2192 Open Solvasion now`,
  ].join('\n');
}

export function guardianFailure(params: {
  hexName: string;
  error: string;
}): string {
  return [
    `\u274c GUARDIAN FAILED for ${params.hexName}`,
    `Auto-reveal could not be submitted: ${params.error}`,
    `You must reveal manually!`,
    `\u2192 Open Solvasion immediately`,
  ].join('\n');
}

export function attackResolved(params: {
  hexName: string;
  outcome: string;
  won: boolean;
}): string {
  const emoji = params.won ? '\u2705' : '\u274c';
  return `${emoji} Battle for ${params.hexName}: ${params.outcome}`;
}

export function incursionWarning(params: {
  factionName: string;
  regionName: string;
  hoursUntil: number;
}): string {
  return [
    `\ud83d\udea8 BOT INCURSION WARNING`,
    `${params.factionName} is preparing an assault on ${params.regionName}!`,
    `Expected in ${params.hoursUntil} hours. Reinforce your positions!`,
  ].join('\n');
}
