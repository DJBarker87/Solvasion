/**
 * Build adjacency lookup from map data edges.
 * adjacency_edges is an array of [u64_string, u64_string] pairs.
 */

let cached: Map<string, Set<string>> | null = null;

export function buildAdjacencyMap(edges: [string, string][]): Map<string, Set<string>> {
  if (cached) return cached;

  const adj = new Map<string, Set<string>>();
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  cached = adj;
  return adj;
}

export function getAdjacent(hexId: string): Set<string> {
  return cached?.get(hexId) ?? new Set();
}

export function areAdjacent(a: string, b: string): boolean {
  return cached?.get(a)?.has(b) ?? false;
}

export function clearAdjacencyCache() {
  cached = null;
}
