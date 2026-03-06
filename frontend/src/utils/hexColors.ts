// Deterministic wallet → color hashing
// Each unique wallet gets a stable hue

const walletColorCache = new Map<string, string>();

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function walletColor(wallet: string): string {
  const cached = walletColorCache.get(wallet);
  if (cached) return cached;

  const hue = hashString(wallet) % 360;
  const color = `hsl(${hue}, 65%, 50%)`;
  walletColorCache.set(wallet, color);
  return color;
}

export function walletFillColor(wallet: string): string {
  const cached = walletColorCache.get(wallet + ':fill');
  if (cached) return cached;

  const hue = hashString(wallet) % 360;
  const color = `hsla(${hue}, 60%, 40%, 0.6)`;
  walletColorCache.set(wallet + ':fill', color);
  return color;
}

// Game state colors
export const COLORS = {
  unownedFill: 'rgba(40, 40, 50, 0.4)',
  unownedLine: 'rgba(100, 100, 120, 0.6)',
  landmarkLine: '#ffd700',        // gold
  underAttackLine: '#ff6600',     // orange (colorblind-friendly vs green)
  garrisonedLine: '#44ff88',      // green
  selectedLine: '#ffffff',        // white
  defaultLine: 'rgba(150, 150, 170, 0.5)',
} as const;
