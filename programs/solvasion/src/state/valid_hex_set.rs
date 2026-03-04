use anchor_lang::prelude::*;

#[account]
pub struct ValidHexSet {
    pub season_id: u64,
    pub chunk_index: u8,
    pub finalized: bool,
    pub hex_count: u32,
    pub hex_ids: Vec<u64>,
    pub region_ids: Vec<u8>,
}

impl ValidHexSet {
    pub const SEED: &'static [u8] = b"valid_hexes";

    /// Calculate account space for a given max hex count.
    /// 8 (discriminator) + 8 (season_id) + 1 (chunk_index) + 1 (finalized) +
    /// 4 (hex_count) + 4 (vec len) + max_hexes * 8 + 4 (vec len) + max_hexes * 1
    pub fn space(max_hexes: u32) -> usize {
        8 + 8 + 1 + 1 + 4 + 4 + (max_hexes as usize * 8) + 4 + (max_hexes as usize)
    }

    /// Binary search for a hex_id. Returns Some(index) if found.
    pub fn find_hex(&self, hex_id: u64) -> Option<usize> {
        self.hex_ids.binary_search(&hex_id).ok()
    }
}
