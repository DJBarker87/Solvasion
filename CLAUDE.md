# CLAUDE.md — Solvasion

## Project Overview

Solvasion is a fully on-chain territory conquest game on Solana. Players battle over a hexagonal grid (H3 resolution 3) overlaid on a real map of Europe. Hidden defence allocations use Pedersen commitments on Ristretto255 — you can see the entire map, but never how strong any position really is. Seasons run up to 28 days. Every game action is a Solana transaction. The backend is a read cache only — the on-chain program is authoritative over all game outcomes.

Free to play. No token. No entry fees. Players pay only Solana rent deposits (refunded at season end) and negligible transaction fees.

## Owner Context

The developer (Dom) is a maths teacher, not a professional software engineer. He relies on Claude to write all code. He has shipped multiple production apps (iOS, React, Node, FastAPI) using this approach but is new to Solana and Rust. Explain Solana-specific concepts when they first appear. Flag footguns. Never assume familiarity with the Solana toolchain.

## Canonical Spec

The full design specification is in `/docs/Solvasion_Design_Specification_v1_7_5.md`. This is the single source of truth for all game mechanics, account structures, instruction logic, and UX requirements. When in doubt about any design decision, read the spec. Do not invent game mechanics or account fields — use what the spec defines.

Key spec sections by topic:
- Game mechanics: Sections 2.1–2.11
- Account structures: Section 3.2
- All instructions (with full logic): Section 3.3
- Events: Section 3.5
- Error codes: Section 3.7
- Backend/crank: Section 4
- Frontend/UX: Section 5
- Pedersen implementation: Section 6.2
- Account sizes and rent: Section 6.4
- Build plan: Section 7

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Frontend (React + TypeScript)                       │
│ Mapbox/Leaflet + H3 overlay, wallet-adapter,        │
│ client-side Ristretto255 (commitment generation)    │
└──────────────────┬──────────────────────────────────┘
                   │ RPC + WebSocket
┌──────────────────▼──────────────────────────────────┐
│ Solana Program (Anchor, Rust)                       │
│ All game logic. Authoritative. ~20 instructions.    │
│ Pedersen verification via solana-curve25519 syscalls │
└──────────────────┬──────────────────────────────────┘
                   │ Events
┌──────────────────▼──────────────────────────────────┐
│ Backend (Node.js)                                   │
│ Event indexer → SQLite, REST API, WebSocket feed,   │
│ crank (timeouts, cleanup), bot controller,          │
│ Guardian auto-reveal service, Telegram notifications│
│ Self-hosted (Linux + KVM)                           │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| On-chain program | Rust + Anchor | solana-dev-skill handles Anchor conventions |
| Cryptography (on-chain) | solana-curve25519 crate | Ristretto curve ID = 1. MSM syscall ~3,253 CU for 2-point Pedersen verification (4,997 CU total with Anchor overhead) |
| Cryptography (client) | @noble/curves | Ristretto255 commitment generation, blinding factor derivation |
| Frontend | React + TypeScript + Tailwind | Mapbox GL JS or Leaflet with h3-js overlay |
| Wallet | @solana/wallet-adapter-react | Phantom, Solflare, Backpack |
| Backend | Node.js + SQLite | PostgreSQL upgrade path if needed |
| Notifications | node-telegram-bot-api | Opt-in attack alerts and daily briefings |
| Hosting | Self-hosted Linux | Backend, crank, Guardian, bot controller |
| Frontend hosting | Vercel or self-hosted | Static site |

## Critical Design Decisions (Do Not Override)

These are settled decisions from the spec. Do not propose alternatives.

### Pedersen Commitments — CONFIRMED FEASIBLE (benchmarked 2026-03-03)
- Syscalls are active on devnet and mainnet (used by Token-2022 Confidential Transfers)
- **Measured on devnet:** Pedersen verification = **4,997 CU total** (MSM syscall portion = ~3,253 CU)
- SHA256 verification = **8,676 CU total** — Pedersen is actually cheaper than SHA256 on Solana
- Noop baseline = 1,102 CU (Anchor instruction dispatch overhead)
- Use `solana-curve25519` crate with `PodRistrettoPoint` and `PodScalar` types
- Ristretto curve ID is **1** (not 2)
- Generator H derived via: `ristretto255_hasher.hashToCurve("Solvasion:DefenceCommitment:H:v1")`
- SHA256 fallback plan is shelved — Pedersen is the path
- Benchmark program deployed: `BjafoRurxEY6vbvrvoj6n5aZcchkui4mxav6SV9djpBz` (devnet)
- Benchmark source: `solvasion-pedersen-benchmark/` directory

### One Attack Per Hex
A hex can only have one pending attack at a time. No multi-attack resolution ordering.

### Energy Is the Single Resource
No tokens, no secondary currencies. Energy earned from territory, spent on all actions. Cap: 500. Lazy calculation on-chain via floor division.

### Season Account Is Read-Only After Creation
Mutable counters (player_count, total_hexes_claimed, next_attack_id) live in a separate SeasonCounters PDA to avoid write contention. Season account is effectively immutable during gameplay.

### Map Data Stored On-Chain
ValidHexSet and AdjacencySet accounts. Binary search validation. No Merkle proofs. Immutable after `finalize_map_data`. Sizes depend on season preset (see Map Presets below).

### Defence Commitment Is Consumed On Reveal
Whether the defender wins or loses, the revealed commitment is cleared. The defender must recommit after every combat. This is intentional design, not a bug.

### Ties Go to Defender
`attacker_energy > defender_energy` for attacker win. Equal energy = defender wins.

### Map Presets (H3 Resolution 3)

The spec originally estimated ~350 hexes at resolution 4, but H3 res 4 gives ~5,600 hexes for Europe. Resolution 3 is the correct choice. Map generation script: `scripts/generate-map.ts`.

**Season 1: Western Theatre** (`--season western`)
- 251 land hexes, 14 landmarks, 7 regions (British Isles, Iberia, France, Low Countries, Alps, Italy, Central Europe)
- 602 adjacency edges, 5 bridge edges (sea crossings)
- ValidHexSet: 2.2 KB, AdjacencySet: 9.4 KB → ~0.085 SOL rent
- Bridge edges: English Channel, Irish Sea, Strait of Messina, Corsica Ferry, Sardinia Ferry
- 100% single connected component. Dropped: 7 hexes of misclassified Tunisian coast.
- Original spec balance parameters (50,000 victory threshold, 500 energy cap) work at this hex count.

**Season 2: Full Europe** (`--season full`)
- ~693 land hexes, 24 landmarks, 12 regions (Russia cut east of 38°E/Moscow)
- ~1,750 edges, 6 bridge edges
- ValidHexSet: 6.1 KB, AdjacencySet: 27.3 KB → ~0.24 SOL rent
- Needs rebalanced season params: victory threshold ~100,000, energy cap ~700.

Bridge edges are regular adjacency entries in the AdjacencySet — no special on-chain treatment. They are listed separately in `map-data-*.json` for UI labelling ("English Channel Crossing" etc.) and potential future bridge-tax season parameters. Both endpoints of every bridge are in the ValidHexSet. Bridges are symmetric (A↔B).

## On-Chain Program Structure

### Account PDAs

| Account | Seed | Lifecycle |
|---------|------|-----------|
| GlobalConfig | `["global_config"]` | Permanent singleton |
| Season | `["season", season_id]` | Permanent record |
| SeasonCounters | `["season_counters", season_id]` | Closed at season end |
| Player | `["player", season_id, wallet]` | Closed at season end |
| Hex | `["hex", season_id, hex_id]` | Closed at season end |
| Attack | `["attack", season_id, attack_id]` | Closed on resolution |
| ValidHexSet | `["valid_hexes", season_id]` | Closed at season end |
| AdjacencySet | `["adjacency", season_id, chunk_index]` | Closed at season end |
| Reputation | `["reputation", wallet]` | Permanent |
| PhantomRecovery | `["phantom", season_id, wallet, hex_id]` | Closed on recovery or season end |

### Season Phases

```rust
enum Phase { LandRush, War, EscalationStage1, EscalationStage2, Ended }
```

Phases determined by timestamps, not stored enum — use `effective_phase()` helper that reads Season timestamps and current clock.

### Instructions (20 total)

**Setup:** initialize, create_season, init_valid_hexes, append_hex_data, init_adjacency, append_adjacency_data, finalize_map_data
**Player:** join_season, set_banner, set_shield, set_posture, set_guardian, clear_guardian
**Gameplay:** claim_hex, commit_defence, increase_defence, withdraw_defence, recommit_defence, launch_attack, reveal_defence, resolve_timeout
**Season end:** claim_victory, finalize_chunk, finalize_complete, close_season_hex, close_season_player, update_reputation, recover_phantom_energy, clear_phantom_energy

### Energy Calculation Pattern (Used Everywhere)

```rust
let seconds_elapsed = now - player.last_energy_update;
let energy_earned = (seconds_elapsed as u64 * total_rate) / 3600;
// floor division, u32 arithmetic, capped at energy_cap
player.energy_balance = min(player.energy_balance + energy_earned as u32, season.energy_cap);
player.last_energy_update = now;
```

Always recalculate energy before any instruction that reads or modifies energy_balance.

### Pedersen Verification Pattern (reveal_defence, withdraw_defence, recommit_defence)

```rust
// Verify opening (a, r) matches stored commitment C
// C' = a·G + r·H
// Compare C'.0 == stored_commitment bytes

use solana_curve25519::ristretto::{PodRistrettoPoint, multiscalar_multiply_ristretto};
use solana_curve25519::scalar::PodScalar;

// Convert energy amount to 32-byte LE scalar
let mut energy_bytes = [0u8; 32];
energy_bytes[..4].copy_from_slice(&energy_amount.to_le_bytes());
let a_scalar = PodScalar(energy_bytes);
let r_scalar = PodScalar(blinding_factor_bytes);

// G = Ristretto basepoint (compressed constant, 32 bytes)
// H = program constant derived from domain separator
let result = multiscalar_multiply_ristretto(&[a_scalar, r_scalar], &[G, H])
    .ok_or(ErrorCode::CurveOpFailed)?;
require!(result.0 == stored_commitment, ErrorCode::InvalidCommitmentOpening);
```

## Project Layout

```
solvasion/
├── CLAUDE.md                          # This file
├── docs/
│   └── Solvasion_Design_Specification_v1_7_5.md  # The canonical spec
├── programs/
│   └── solvasion/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                 # Program entrypoint, declare_id
│           ├── state/                 # Account structures (Section 3.2)
│           │   ├── mod.rs
│           │   ├── season.rs
│           │   ├── player.rs
│           │   ├── hex.rs
│           │   ├── attack.rs
│           │   └── ...
│           ├── instructions/          # One file per instruction (Section 3.3)
│           │   ├── mod.rs
│           │   ├── claim_hex.rs
│           │   ├── launch_attack.rs
│           │   ├── reveal_defence.rs
│           │   └── ...
│           ├── errors.rs              # Error enum (Section 3.7)
│           ├── events.rs              # Event structs (Section 3.5)
│           └── crypto.rs             # Pedersen helpers, generator H constant
├── tests/                             # Anchor tests (TypeScript)
├── backend/                           # Node.js backend
│   ├── src/
│   │   ├── indexer.ts                # Event indexer
│   │   ├── crank.ts                  # Reconciliation crank
│   │   ├── bots.ts                   # NPC bot controller
│   │   ├── guardian.ts               # Auto-reveal service
│   │   ├── telegram.ts              # Notification service
│   │   └── api.ts                    # REST + WebSocket API
│   └── db/
│       └── schema.sql
├── frontend/                          # React app
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── crypto/                   # Client-side Pedersen commitment generation
│   │   └── ...
│   └── ...
├── scripts/
│   ├── generate-map.ts               # H3 hex generation + adjacency
│   └── upload-map.ts                 # On-chain map data upload
└── Anchor.toml
```

Use the Anchor "multiple files" pattern — one file per instruction in `instructions/`, one file per account type in `state/`. Do not put everything in a single `lib.rs`.

## Coding Conventions

### Rust (on-chain program)
- Use `checked_add()`, `checked_sub()`, `checked_mul()` for all arithmetic — never allow overflow
- All energy calculations use `u32`. All timestamps use `i64` (Unix seconds).
- Floor division everywhere: `(a * b) / c` not `(a * b + c - 1) / c`
- Every instruction that reads energy must call the lazy energy recalculation first
- Use `require!()` macro for all validation checks
- Error messages map to the error enum in Section 3.7 of the spec
- Account size estimates need verification — calculate from actual struct fields, do not guess
- Pedersen verification uses only ~5,000 CU, so the default 200,000 CU budget is fine. No need for `ComputeBudgetProgram.setComputeUnitLimit()` unless the instruction does significant additional work beyond the commitment check.

### TypeScript (tests + frontend + backend)
- Use @solana/kit for new code (not legacy web3.js) per solana-dev-skill guidance
- Use @noble/curves v2.x for client-side Ristretto255 operations:
  - Import: `import { ristretto255, ristretto255_hasher } from "@noble/curves/ed25519.js"` (note `.js` extension required for ESM)
  - Point class: `ristretto255.Point` (NOT `RistrettoPoint` — that was v1.x)
  - Base point: `ristretto255.Point.BASE`
  - Hash-to-curve: `ristretto255_hasher.hashToCurve(bytes)`
  - Point ops: `.multiply(scalar)`, `.add(point)`, `.toBytes()`, `.toHex()`
  - Also need `@noble/hashes` for `sha512`, `utf8ToBytes` etc: `import { sha512 } from "@noble/hashes/sha2.js"`
- Use h3-js for hex coordinate operations
- All commitment generation happens client-side, never on the backend
- When calling devnet, use `skipPreflight: true` and add a ~2s delay before `getTransaction()` to avoid "Blockhash not found" errors

### Naming
- The spec uses "defence" (British spelling) throughout. Match this in all code, comments, events, and UI copy.
- The UI uses "garrison" as user-facing terminology for defence commitments (Section 5.6 of spec). Code uses "defence" / "commitment" internally.
- Field Game scoring: a rouge is 5 points, a goal is 3 points (unrelated to Solvasion, but Dom may reference it)

## Build Order

The project builds in phases. Do not jump ahead.

### Phase 1: Map Data + Crypto Validation (current)
- [x] Pedersen CU benchmark — CONFIRMED 4,997 CU total / ~3,253 CU crypto (devnet, 2026-03-03) ✅
- [x] H3 map generation script — DONE. Res 3, Season 1 "Western Theatre" = 251 hexes / 14 landmarks / 7 regions / 5 bridges / 100% connected ✅
- [ ] Hardcode generator H constant

### Phase 2: On-Chain Program — Core (Weeks 3–5)
- Account structures → admin/season setup → join/claim → defence commit/reveal → attack/combat → phase transitions → victory

### Phase 3: On-Chain Program — Extended (Weeks 6–7)
- Finalization, cleanup, reputation, phantom recovery, theatre system

### Phase 4: Backend (Weeks 8–10)
- Event indexer, crank, REST API, Telegram, bot controller, Guardian service

### Phase 5: Frontend (Weeks 11–14)
- Map rendering, game flows, defence UI, war feed, leaderboard

### Phase 6: Testing + Launch (Weeks 15–16)
- End-to-end testing, security review, mainnet deployment, Season 1

## Common Pitfalls (Solvasion-Specific)

### Toolchain (confirmed working as of 2026-03-03)
- **Current working versions:** Solana CLI 3.0.15 (Agave) + Anchor 0.32.1 + platform-tools v1.51. This combination builds and deploys successfully.
- Anchor version must match Solana CLI version. Anchor 0.30.x = Solana 1.18.x. Anchor 0.31+ = Solana 2.0+. Anchor 0.32+ = Solana 2.1+/3.0+.
- **When versions are mismatched, fix the toolchain — do NOT pin individual crates.** Chasing `cargo update --precise` for `constant_time_eq`, `blake3`, `indexmap`, `borsh-derive`, `ahash`, `proc-macro-crate` etc. is a losing game. Align Anchor + Solana CLI versions first, then `rm -rf target/ Cargo.lock && anchor build`.
- Use `agave-install update` (not `solana-install`) to update the Solana CLI on this machine.
- Use `avm install <version> && avm use <version>` to switch Anchor versions.
- platform-tools v1.51 bundles Cargo 1.84 which does NOT support Rust edition 2024. If a transitive dependency uses edition 2024, you cannot use it. This currently blocks `solana-sha256-hasher` (via blake3 -> constant_time_eq 0.4.2). Use the `sha2` crate directly instead.
- Anchor 0.32 re-exports a **partial** `solana_program` module (account_info, clock, pubkey, instruction, rent, etc.) but does **NOT** re-export `log`, `hash`, or `program`. If you need these, add the specific sub-crate (`solana-msg` for CU logging, `sha2` for hashing).
- For `sol_log_compute_units()` on-chain, use `solana_msg::syscalls::sol_log_compute_units_()` (unsafe, behind `#[cfg(target_os = "solana")]`).
- The `solana-curve25519` crate v2.x works with Anchor 0.32 and does NOT pull in blake3, so it avoids the edition 2024 issue.
- Anchor automatically syncs program IDs between `declare_id!()` in lib.rs and Anchor.toml — do not manually manage these.

### Pedersen Commitments
- The program NEVER sees per-hex energy amounts at commit time. It stores opaque 32-byte commitments and a total `energy_committed` delta. Verification only happens at reveal.
- `increase_defence` does NOT verify the new commitment matches old + delta. The trust model is: cheating only harms the cheater (they'll fail on reveal).
- Blinding factors are deterministic from `(seed, hex_id, nonce)`. This is critical for multi-device recovery.
- The `commitment_nonce` on Player is strictly monotonic and enforced on-chain. The `defence_nonce` on Hex is a snapshot of the nonce used for that hex's current commitment.

### Pedersen Edge Cases (verify during Phase 2)
- Reject identity point commitments as a sanity check
- Verify PodScalar rejects non-canonical scalars (> group order)
- energy_amount range check (0 to energy_cap) already specified in Section 2.5.1

### Combat
- Defender's commitment is consumed on ANY reveal (win or lose). This is intentional.
- Timeout via `resolve_timeout` does NOT reduce defender's `energy_committed` (the program doesn't know the per-hex amount). This creates phantom energy — tracked separately.
- Attacker surplus (attack - defence) is returned on attacker win. Attacker loses at least `min_attack_energy` on timeout win.
- 4-hour cooldown after defender wins (recommit grace). 30-minute cooldown after capture.

### Account Lifecycle
- Hex accounts are created by `claim_hex` (init) and closed by `close_season_hex` (crank, post-season). Rent goes to hex owner at time of closure.
- Attack accounts are created by `launch_attack` (init) and closed on resolution (reveal or timeout). Rent returned to attacker.
- Player accounts closed post-season by crank. Rent returned to player wallet.
- Season account is NEVER closed — permanent on-chain record.

## Testing Strategy

- Every instruction needs at least: happy path, insufficient energy, wrong phase, wrong owner/signer
- Combat resolution needs: attacker wins, defender wins, exact tie (defender wins), timeout, shield extension
- Pedersen verification needs: valid opening, wrong amount, wrong blind, wrong hex
- Energy calculation needs: edge cases around floor division, cap, zero hexes
- Map validation needs: valid hex, invalid hex, valid adjacency, invalid adjacency, chunk boundaries

## Infrastructure

Infrastructure details are kept in `.claude/` (gitignored) to avoid exposing hostnames, usernames, and domain patterns in a public repo.
