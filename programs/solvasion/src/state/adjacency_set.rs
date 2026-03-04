use anchor_lang::prelude::*;

/// Stored as (hex_a, hex_b) where hex_a < hex_b.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct Edge {
    pub hex_a: u64,
    pub hex_b: u64,
}

#[account]
pub struct AdjacencySet {
    pub season_id: u64,
    pub chunk_index: u8,
    pub finalized: bool,
    pub edge_count: u32,
    pub edges: Vec<Edge>,
}

impl AdjacencySet {
    pub const SEED: &'static [u8] = b"adjacency";

    /// Calculate account space for a given max edge count.
    /// 8 (discriminator) + 8 (season_id) + 1 (chunk_index) + 1 (finalized) +
    /// 4 (edge_count) + 4 (vec len) + max_edges * 16
    pub fn space(max_edges: u32) -> usize {
        8 + 8 + 1 + 1 + 4 + 4 + (max_edges as usize * 16)
    }

    /// Binary search for an edge. Normalises ordering so hex_a < hex_b.
    pub fn find_edge(&self, a: u64, b: u64) -> bool {
        let (lo, hi) = if a < b { (a, b) } else { (b, a) };
        self.edges
            .binary_search_by(|e| {
                e.hex_a.cmp(&lo).then_with(|| e.hex_b.cmp(&hi))
            })
            .is_ok()
    }
}
