# HexWorld v1.3 — Consolidated Change List

## From v1.2 → v1.3

**Sources:** Claude review, external Solana developer review, Ristretto syscall research, Dom's design decisions.

**Status:** All decisions confirmed. Ready for spec rewrite.

---

## 1. CRITICAL FIXES (bugs / broken logic)

### 1.1 Combat Accounting Bug — Defender Wins Path

**Problem:** v1.2 `reveal_defence` defender-wins path says "deduct attack.energy_committed from defender's energy_committed." This is wrong. The attacker's energy was already deducted at launch time. The defender revealed `energy_amount`, which is what gets consumed.

**Fix:** Defender wins → deduct `energy_amount` (the revealed defence) from defender's `energy_committed`. The attacker's `attack.energy_committed` is already gone (deducted in `launch_attack`). Attacker loses all committed energy. Defender loses only what they revealed.

### 1.2 `update_reputation` Must Be Permissionless

**Problem:** v1.2 requires `player_wallet (signer)` for `update_reputation`. The crank cannot sign as players. Players who miss the window before account closure lose their season stats permanently.

**Fix:** Remove signer requirement. The instruction only copies deterministic stats from a Player PDA into a Reputation PDA — no security reason to require the player's signature. The crank calls it for all players automatically during the cleanup phase. Change accounts to: `any_signer (payer), season (read), player (read), reputation (mut, init_if_needed)`.

### 1.3 Account Closure Plumbing

**Problem:** `close_season_hex` sends rent "to hex.owner" but on Solana, the recipient must be passed as an account in the instruction. You can't send lamports to an arbitrary pubkey from account data without it being in the accounts list.

**Fix:** `close_season_hex` and `close_season_player` must include the recipient wallet as a remaining account. The instruction verifies it matches the stored owner/player pubkey before closing.

---

## 2. COMBAT ECONOMICS OVERHAUL (anti-griefing)

### 2.1 Timeout Resolution — Tiered Energy Refund

**Problem:** v1.2 returns full attack energy on timeout. This makes attacking sleeping players free, enabling harassment spam and hex-locking griefing.

**New rule:** On timeout, attacker wins the hex. Energy returned = `max(0, energy_committed - season.min_attack_energy)`. The attacker always loses at least `min_attack_energy` (default 10).

**Effect:**

| Attack energy | Energy lost | Energy returned | Cost as % |
|---|---|---|---|
| 10 (spam) | 10 | 0 | 100% |
| 30 (probe) | 10 | 20 | 33% |
| 80 (serious) | 10 | 70 | 12% |

Griefing with minimum attacks costs 100% every time. Legitimate conquest is barely penalised. `min_attack_energy` becomes a tunable anti-spam parameter per season.

### 2.2 Outcome-Dependent Post-Combat Cooldown

**Problem:** v1.2 only has occupation shield (30 min after ownership change). Successfully defended hexes can be immediately re-attacked, exhausting defenders.

**New rule:** Add `last_combat_resolved` timestamp on Hex account. Cooldowns:

- **Attacker wins (capture):** 30-minute occupation shield (unchanged)
- **Defender wins (successful defence):** 60-minute combat cooldown
- **Timeout (attacker wins by default):** 30-minute occupation shield

`launch_attack` checks the appropriate cooldown before allowing an attack.

**Effect:** Successful defence is rewarded with MORE protection than a capture. Failed attackers can't immediately retry. Defenders get breathing room to recommit.

### 2.3 Updated `resolve_timeout` Logic

```
resolve_timeout:
  - Verify attack not resolved, deadline passed
  - Attacker wins hex
  - Transfer ownership, set last_owner_change = now
  - Energy returned to attacker = max(0, attack.energy_committed - season.min_attack_energy)
  - Defender's energy_committed: NOT reduced (phantom energy penalty, see §4)
  - Update hex_count, landmark_count, stats for both players
  - Set attack.resolved = true, result = DefaultWin
  - Clear hex commitment
  - Close Attack account
  - Recalculate points, check victory threshold
```

### 2.4 Updated `reveal_defence` Logic (both paths)

```
reveal_defence — ATTACKER WINS (attack energy > defence energy):
  - Transfer hex to attacker
  - Set last_combat_resolved = now, last_owner_change = now
  - Surplus = attack.energy_committed - energy_amount
  - Return surplus to attacker's energy_balance
  - Deduct energy_amount from DEFENDER's energy_committed
  - Update hex_count, landmark_count, stats
  - Clear hex commitment
  - Close Attack account

reveal_defence — DEFENDER WINS (attack energy ≤ defence energy):
  - Hex remains with defender
  - Set last_combat_resolved = now (triggers 60-min cooldown)
  - Deduct energy_amount from DEFENDER's energy_committed (commitment consumed)
  - Attacker loses all committed energy (already deducted at launch)
  - Update stats
  - Clear hex commitment (defender must recommit)
  - Close Attack account
```

---

## 3. ON-CHAIN MAP DATA (replacing Merkle trees)

### 3.1 All On-Chain Hex and Adjacency Storage

**Decision:** Replace Merkle proof system with direct on-chain storage of hex set and adjacency edges. At resolution 4 (~500 hexes, ~2000 edges), total data is ~36KB — easily stored on-chain.

**New accounts:**

#### ValidHexSet

**PDA seed:** `["valid_hexes", season_id.to_le_bytes(), chunk_index]`

Stores sorted array of valid H3 hex IDs. At 500 hexes × 8 bytes = 4,000 bytes, fits in a single account. Created during season setup.

| Field | Type | Description |
|---|---|---|
| `season_id` | `u64` | Season |
| `hex_count` | `u32` | Number of valid hexes in this chunk |
| `hex_ids` | `[u64; N]` | Sorted array of valid H3 indices |

#### AdjacencySet

**PDA seed:** `["adjacency", season_id.to_le_bytes(), chunk_index]`

Stores sorted array of adjacency edges as `(hex_a, hex_b)` pairs where `hex_a < hex_b`. At ~2,000 edges × 16 bytes = 32,000 bytes. May require 2-3 chunks depending on account size preferences. Created during season setup.

| Field | Type | Description |
|---|---|---|
| `season_id` | `u64` | Season |
| `edge_count` | `u32` | Number of edges in this chunk |
| `edges` | `[(u64, u64); N]` | Sorted array of (hex_a, hex_b) pairs |

**Validation method:** Binary search through sorted arrays. No hashing, no proofs.

**Season creation:** Multi-transaction setup. Admin calls `init_valid_hexes` then `append_hex_data` in chunks (limited by transaction size), then `init_adjacency` + `append_adjacency_data`, then `finalize_map_data` which sets a `map_finalized` flag on the Season account. No game instructions work until map is finalized.

**Rent:** ~0.25 SOL total, refunded when accounts are closed at season end (same cleanup crank as hex/player accounts).

**Scaling note:** This approach works well at resolution 4 (~500 hexes). At resolution 5 (~2,500 hexes, ~7,500 edges, ~120KB), you'd need to either split across more accounts or switch to Merkle proofs. That's a future decision.

### 3.2 Removed from Spec

- `valid_hex_root` and `adjacency_root` fields from Season account
- All Merkle proof parameters from `claim_hex` and `launch_attack`
- Backend Merkle tree service (§4.3.3)
- `/api/seasons/:id/merkle/*` endpoints
- `merkle_proofs` database table
- All references to Merkle proof verification in security considerations and compute budget sections
- Frontend proof fetching logic

### 3.3 Changes to Season Account

Remove: `valid_hex_root`, `adjacency_root`
Add: `map_finalized: bool` — set to true after all hex/adjacency data is written

### 3.4 Changes to `claim_hex`

Remove: `hex_merkle_proof`, `adjacency_merkle_proof` parameters
Add: `valid_hex_set` account (read), `adjacency_set` account (read, only if adjacency check needed)
Validation: binary search through `valid_hex_set.hex_ids` for hex existence, binary search through `adjacency_set.edges` for adjacency

### 3.5 Changes to `launch_attack`

Remove: `adjacency_merkle_proof` parameter
Add: `adjacency_set` account (read)
Validation: binary search through `adjacency_set.edges`

---

## 4. PHANTOM ENERGY CLEANUP

### 4.1 Permissionless `clear_phantom_energy` Instruction

**Problem:** When a player loses hexes by timeout, their `energy_committed` total includes "dead" energy that can never be reclaimed. This is confusing and can permanently cripple a player's season.

**New instruction:** `clear_phantom_energy`

**Purpose:** Permissionless instruction that recalculates a player's actual committed energy by summing commitments across their currently-owned hexes, and adjusts `energy_committed` to match reality.

**Accounts:** `any_signer`, `season (read)`, `player (mut)`, remaining accounts: all Hex accounts owned by this player that have commitments

**Logic:**
- Verify season is active (not ended)
- Count total hexes with `has_commitment == true` owned by this player (from remaining accounts)
- The actual committed energy cannot be known (commitments are hidden), but the program can verify: if a player's `energy_committed > 0` but they own zero hexes with commitments, set `energy_committed = 0`
- More precisely: the crank can call this after any timeout loss. If the player has no remaining hex commitments, their `energy_committed` is phantom and gets zeroed

**Limitation:** This only fully works when the player has ZERO committed hexes remaining. If they have some committed and some lost, the program can't distinguish real from phantom without revealing amounts. For partial cases, the existing model applies (phantom energy remains locked).

**Alternative approach (simpler):** Track a `phantom_energy` field on the Player account. When `resolve_timeout` fires and the defender loses a hex with a commitment, add a fixed estimate (e.g. `energy_committed / hex_count_before_loss`) to `phantom_energy`. The UI shows `energy_committed - phantom_energy` as the "active" committed amount. Not cryptographically precise but gives players a clear picture.

**Recommendation:** Implement both: the `clear_phantom_energy` instruction for the zero-commitment case, and the `phantom_energy` tracking field for UI purposes.

---

## 5. SEASON ACCOUNT WRITE CONTENTION FIX

### 5.1 Split All Mutable Counters into Separate PDAs

**Problem:** The Season account is written by claims (`total_hexes_claimed`), attacks (`next_attack_id`), and joins (`player_count`). On Solana, write-locks on shared accounts prevent transaction parallelism.

**New accounts:**

#### SeasonCounters

**PDA seed:** `["season_counters", season_id.to_le_bytes()]`

| Field | Type | Description |
|---|---|---|
| `season_id` | `u64` | Season |
| `player_count` | `u32` | Number of joined players |
| `total_hexes_claimed` | `u32` | Total hexes currently owned |
| `next_attack_id` | `u64` | Incrementing attack counter |

**Effect:** Season account becomes effectively read-only after creation (only written on phase changes and finalization). All high-frequency writes go to SeasonCounters. Instructions that only need to read season config (energy rates, timing, etc.) don't take a write lock on a contended account.

**Lifecycle:** Created alongside Season. Closed at season end (rent refunded to admin).

---

## 6. NPC BOT SYSTEM (v1 feature)

### 6.1 Bot Controller Service

A backend service that runs alongside the crank, controlling NPC bot wallets.

**Core design:**
- Bots are real Solana wallets making real on-chain transactions
- Clearly labelled: distinct "BOT" tag on profile, NPC names (e.g. "The Roman Legion", "Norse Raiders", "Ottoman Empire")
- Personality archetypes: Turtle (compact territory, heavy defence), Expansionist (spreads thin), Aggressor (attacks frequently, weak defence)
- Server-side: bot secret seeds and defence allocations live on the backend
- Respond to attacks automatically within the countdown window (with randomised delay)

**Scaling:**
- Start a season with 15–20 bots
- As human players join, gradually retire bots (stop reinforcing, get conquered naturally)
- If season hits 30+ humans, all bots can be eliminated through gameplay
- If it stays at 5 humans, bots keep the map alive

**Cryptographic integrity:** Bots use the same Pedersen commitment scheme as players. Their defence allocations are genuinely hidden — even the admin cannot see them without the bot wallet's secret seed. Run the bot service with its own wallet keys, no backdoor.

**Implementation:** Phase 4 (backend), ~2-3 days additional work. Bot controller as a separate Node.js module alongside the crank.

---

## 7. NOTIFICATION SYSTEM (v1 feature, not v2)

### 7.1 Telegram Bot

**Approach:** Telegram bot that sends alerts to players who opt in.

**Player flow:**
1. Player starts a chat with the HexWorld Telegram bot
2. Bot generates a unique link code
3. Player enters the code in the HexWorld frontend while wallet is connected
4. Backend stores the mapping: wallet → Telegram chat ID
5. Player receives alerts

**Alerts (v1):**
- "⚔️ Your hex [Paris] is under attack! You have 5h 42m to defend." (on `AttackLaunched` where player is defender)
- "🏳️ You lost [Berlin] — defender timeout." (on `AttackTimedOut`)
- "🛡️ You successfully defended [London]!" (on `AttackResolved`, defender wins)
- "📯 Season 1 has entered the War Phase!" (on `PhaseChanged`)
- "🏆 [Player] is approaching victory! 45,000 / 50,000 points" (threshold alert)

**Implementation:** Node.js `node-telegram-bot-api` package. Backend monitors events and sends messages. ~1 day of work.

**Database addition:**
```sql
CREATE TABLE notification_preferences (
    wallet          TEXT PRIMARY KEY,
    telegram_chat_id TEXT,
    link_code       TEXT,
    linked_at       INTEGER,
    alerts_enabled  BOOLEAN DEFAULT TRUE
);
```

---

## 8. PEDERSEN COMMITMENT — RISK MITIGATION

### 8.1 Decision: Pedersen is Core, But With Contingency

Pedersen commitments remain the target for v1. However:

**Phase 1, Day 1:** Write a micro-program that performs Pedersen verification (decompress stored commitment, compute `a·G + r·H`, compress and compare). Deploy to devnet. Measure actual CU cost.

**If curve25519 syscalls are active:** Proceed as specified. Expected cost ~30k CU via syscall.

**If syscalls are NOT active (pure BPF):** Scalar multiplication costs ~3.4M CU per the Solana Labs benchmarks. Two multiplications = ~6.8M CU — far beyond the 1.4M CU max compute budget. In this case:

- **Option A:** Investigate CPI to the ZK ElGamal Proof Program (if re-enabled after audit) for Pedersen verification via a native program
- **Option B:** Use a pre-verification pattern: client submits the opening `(a, r)` and the program recomputes the commitment using a cheaper construction (potentially leveraging Ed25519 signature verification syscall creatively)
- **Option C:** Fall back to SHA256 with the v1.1 `total_energy_delta` design. Ship the game. Upgrade to Pedersen when syscalls are confirmed live.

**The game ships regardless.** The commitment scheme is the hiding mechanism, not the game mechanic. SHA256 with aggregate deltas still provides meaningful strategic depth.

---

## 9. DOCUMENT CLEANUP

### 9.1 Remove Duplicate Sections

v1.2 contains duplicate sections with minor variations (artefact of v1.1→v1.2 merge):
- Sections 4.x (Backend Service) appears twice
- Sections 5.x (Frontend) appears twice
- Sections 6.x (Technical Considerations) appears twice
- Section 3.6 (Security Considerations) appears twice

Consolidate into single authoritative versions.

### 9.2 Updated Timeline

Extend from 9 weeks to ~16 weeks to be realistic:

| Phase | Duration | Content |
|---|---|---|
| 1. Map Data + Crypto Validation | Week 1-2 | H3 generation, on-chain data format, Pedersen CU benchmark |
| 2. On-Chain Core | Weeks 3-5 | Accounts, claims, combat, commitments |
| 3. Season Lifecycle | Weeks 6-7 | Phases, finalization, cleanup, reputation |
| 4. Backend + Bots | Weeks 8-10 | Indexer, crank, API, bot controller, Telegram bot |
| 5. Frontend MVP | Weeks 11-14 | Map, wallet, claims, combat, defence UI, leaderboard |
| 6. Testing + Launch | Weeks 15-16 | Devnet testing, security review, mainnet deploy |

---

## 10. MINOR CHANGES

### 10.1 Hex Account — New Fields

Add to Hex account:
- `last_combat_resolved: i64` — timestamp of most recent combat resolution on this hex (for outcome-dependent cooldown)

### 10.2 Player Account — New Field

Add to Player account:
- `phantom_energy: u32` — estimated energy locked in lost hex commitments (for UI display)

### 10.3 Season Account — Removed Fields

Remove from Season:
- `valid_hex_root: [u8; 32]`
- `adjacency_root: [u8; 32]`
- `player_count: u32` (moved to SeasonCounters)
- `total_hexes_claimed: u32` (moved to SeasonCounters)
- `next_attack_id: u64` (moved to SeasonCounters)

Add to Season:
- `map_finalized: bool`

### 10.4 New Instructions Summary

| Instruction | Purpose |
|---|---|
| `init_valid_hexes` | Create the ValidHexSet account for a season |
| `append_hex_data` | Write chunks of hex IDs during season setup |
| `init_adjacency` | Create the AdjacencySet account(s) for a season |
| `append_adjacency_data` | Write chunks of adjacency edges during season setup |
| `finalize_map_data` | Lock map data, set `map_finalized = true` |
| `clear_phantom_energy` | Permissionless cleanup of dead committed energy |

### 10.5 Removed Endpoints

- `/api/seasons/:id/merkle/hex/:hexId`
- `/api/seasons/:id/merkle/edge/:hexA/:hexB`

### 10.6 Removed Database Table

- `merkle_proofs`

---

## DECISION SUMMARY

| Decision | Choice | Rationale |
|---|---|---|
| Timeout economics | Tiered: lose min_attack_energy minimum | Kills griefing spam, preserves legitimate warfare |
| Post-combat cooldown | Outcome-dependent (30 min capture, 60 min defence) | Rewards active defence, prevents re-attack spam |
| Pedersen vs SHA256 | Pedersen core, SHA256 contingency | Vision preservation with pragmatic fallback |
| Merkle trees | All on-chain (hex set + adjacency stored directly) | Fully on-chain, no off-chain dependencies |
| Phantom energy | Permissionless cleanup + UI tracking field | Clear UX without softening the penalty |
| Season hot accounts | Split all counters to separate PDA | Season becomes read-only after creation |
| Reputation update | Permissionless (no player signature) | Crank handles it, no missed windows |
| Bots | v1 feature, clearly labelled NPCs | Solves cold-start, stress-tests infrastructure |
| Notifications | Telegram bot, v1 feature | Fastest to ship, crypto audience already uses it |
| Timeline | 16 weeks (up from 9) | Realistic for quality output |
