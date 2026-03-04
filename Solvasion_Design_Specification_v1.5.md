# Solvasion — Design Specification v1.5

## Fully On-Chain Territory Conquest on Solana

**Author:** Dom Barker
**Date:** March 2026
**Status:** Draft (revised from v1.4 incorporating phantom energy recovery, auto-reveal UX, cloud defence backup, increase_defence feature framing, and simplified shield UX)

---

## Changelog from v1.4

- **Phantom energy partial recovery** — missed reveals are now a soft fail. New `recover_phantom_energy` instruction allows players to reclaim 50% of phantom energy after a 24-hour delay, once per lost hex per season. Punishes inattentiveness (time + partial loss) without feeling like theft.
- **Auto-reveal UX support** — new Section 5.2.5.1 specifying attack countdown UI, push notification scheduling, and one-tap reveal prefilled screen. Casuals don't hate responsibility; they hate surprise.
- **Cloud defence backup** — Section 5.5.2 updated with optional encrypted cloud backup (wallet-linked storage) as a second persistence layer alongside localStorage. Export/Import in settings.
- **`increase_defence` delta leakage framed as feature** — Section 2.5.4 and defence UI updated with explicit copy: "Reinforcing signals commitment; opponents can see you reinforced." Prevents "gotcha" perception.
- **Simplified shield UX** — shield status prominently surfaced in sidebar, attack panel, and attack flow with plain-language banners ("You are in Shield Hours" / "This attack will take 12h because defender's shield is active").

## Changelog from v1.3

- **Nonce invariants specified** — `commitment_nonce` is now the authoritative, enforced nonce. Program rejects client-supplied nonces that don't match. Per-hex `defence_nonce` stores the snapshot for recovery.
- **`finalized_count` promoted to required** — added to SeasonCounters. `finalize_complete` now checks `finalized_count == player_count` on-chain.
- **Map immutability made explicit** — `append_hex_data` and `append_adjacency_data` reject calls after `finalize_map_data`. Stated as invariant.
- **Client Defence State Management** — new Section 5.5 specifying frontend requirements for per-hex amount tracking, persistence, and device recovery.
- **SHA256 fallback impact summary** — new Section 6.2.1 documenting gameplay property changes under SHA256 mode.
- **Respawn rate limit** — `max_respawns_per_season` added as configurable Season parameter. Default 3.
- **Combat cooldown durations made configurable** — `defender_win_cooldown_seconds` and `capture_cooldown_seconds` added to Season account.
- **`reveal_defence` / `resolve_timeout` Season mutability clarified** — Season account changed to `read` on both instructions. Victory detection deferred to `claim_victory`.
- **AdjacencySet chunk routing specified** — client passes chunk index; program validates edge is within chunk bounds.
- **Timezone shield strategic note** — explicit acknowledgement that attackers can time around the shield; this is intentional.
- **Section numbering fixed** — Section 3 is now fully contiguous (3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 before Section 4).
- **Error code catalogue** — new Section 3.7 with full error enum for all instructions.

## Changelog from v1.2

- **Combat accounting fix** — defender-wins path in `reveal_defence` now correctly deducts `energy_amount` (the revealed defence) from defender's `energy_committed`, not the attacker's committed energy
- **Permissionless `update_reputation`** — removed signer requirement so the crank can call it for all players automatically during cleanup
- **Account closure plumbing** — `close_season_hex` and `close_season_player` now include the recipient wallet as a remaining account, verified against stored owner/player pubkey
- **Tiered timeout energy refund** — on timeout, attacker loses at least `min_attack_energy` (default 10). Eliminates free griefing spam
- **Outcome-dependent post-combat cooldown** — successful defence grants 60-minute cooldown (vs 30-minute for captures), rewarding active defenders
- **On-chain map data** — replaced Merkle proof system with direct on-chain storage of hex set and adjacency edges in ValidHexSet and AdjacencySet accounts. Binary search validation, no off-chain dependencies
- **Phantom energy cleanup** — new permissionless `clear_phantom_energy` instruction plus `phantom_energy` tracking field on Player account for UI display
- **Season write contention fix** — split mutable counters (`player_count`, `total_hexes_claimed`, `next_attack_id`) into separate SeasonCounters PDA. Season account becomes effectively read-only after creation
- **NPC bot system (v1)** — bot controller service with personality archetypes, auto-scaling based on human player count, using real Pedersen commitments
- **Telegram notification system (v1)** — opt-in alerts for attacks, defence results, phase changes, and victory proximity
- **Pedersen contingency plan** — Day 1 CU benchmark; if curve25519 syscalls unavailable, fall back to SHA256 with aggregate deltas

## Changelog from v1.1

- **Pedersen commitment scheme** — replaced SHA256 hash commitments with Pedersen commitments on Ristretto255, providing information-theoretic hiding of per-hex defence allocations even against transaction indexers
- **`increase_defence` instruction** — new add-only instruction allows reinforcing a hex without revealing the existing allocation, eliminating the information leakage of `recommit_defence` for the common "add more" case
- **Deterministic blinding factor derivation** — per-hex blinding factors derived from season seed + hex_id + nonce, enabling multi-device recovery via a single wallet signature
- **`defence_nonce` on Hex account** — stored on-chain to support deterministic secret recovery on new devices
- **Post-season account closure** — new `close_season_hex` and `close_season_player` instructions enable automated rent reclamation after season end, with rent returned to hex owners and player wallets respectively
- **Auto-cleanup via crank** — the reconciliation crank automatically closes all season accounts after finalization, returning rent deposits without requiring player action
- **Season account retained** — Season accounts are not closed, serving as permanent on-chain records of past seasons

---

## 1. Overview

### 1.1 The Pitch

Solvasion is a fully on-chain territory conquest game on Solana where players battle over a hexagonal grid overlaid on a real map of Europe. Hidden defence allocations create a fog-of-bluff — you can see the entire map, but you never know how strong any position really is. Seasons run for up to four weeks, with points accumulating from territory and landmark hexes. Every move is a Solana transaction. Every hex is a real place.

Players choose an NFT from their wallet to act as their banner. Their conquered territory is painted with their NFT image — mosaic-tiled at small scale, stretching into a single giant image as contiguous territory grows. The map of Europe becomes a living canvas of competing NFT identities.

### 1.2 Design Principles

**Fully on-chain.** All game logic and state lives in a Solana program. No server is authoritative over game outcomes. The backend exists only as a read cache and convenience layer.

**Async-first.** Players act on their own schedule. There are no simultaneous turns. You log in, make your moves, log off. The world evolves continuously. The timezone shield ensures no player is structurally disadvantaged by where they live.

**Simple rules, deep gameplay.** The core loop — claim, attack, defend, allocate — is learnable in minutes. The hidden defence mechanic and social dynamics create strategic depth that emerges over weeks.

**Real-world identity.** The map is real geography. Your banner is your NFT. Your history is on-chain. Everything in the game connects to something tangible.

### 1.3 Novelty

This would be the first fully on-chain autonomous world on Solana. The fully on-chain game movement (Dark Forest, Sky Strife, OPCraft) has been almost exclusively an Ethereum ecosystem phenomenon, built on MUD/Lattice and Dojo/StarkNet engines. A territory conquest game with hidden information, real-world geography, and NFT identity on Solana is novel across several dimensions simultaneously.

### 1.4 Pricing Model

Solvasion is free to play. There are no entry fees, no token costs, and no platform charges. Players pay only the Solana network costs required by their actions: rent deposits for on-chain accounts and transaction fees.

A typical casual player needs approximately 0.05 SOL in their wallet to cover rent deposits for the season. Most of this is automatically returned when the season ends and accounts are closed. The only permanent cost is the one-time Reputation account (~0.002 SOL) plus negligible transaction fees.

The crank automatically closes Player and Hex accounts after each season, returning rent to players without requiring any manual action.

---

## 2. Game Design

### 2.1 The Map

The game board is a hexagonal grid overlaid on a real map of Europe using Uber's H3 hexagonal spatial indexing system.

**Resolution:** H3 resolution 4, which produces hexes approximately 1,700 km² each (roughly city-sized). This gives approximately 300–500 land hexes covering Europe, excluding ocean. Resolution is configurable per season for future tuning.

**Geographic bounds:** The map covers Europe from approximately Iceland/Portugal in the west to the Urals in the east, and from North Africa in the south to Scandinavia in the north. The exact bounds are configurable per season.

**Hex identification:** Each hex is identified by its H3 index, a 64-bit integer deterministically derived from geographic coordinates. The map itself is never stored on-chain — H3 indices are computed client-side. On-chain, only ownership and defence data per hex are stored.

**Valid hex set:** At season creation, the full set of playable land hexes is precomputed off-chain and stored directly on-chain in a ValidHexSet account as a sorted array of H3 indices. When a player claims a hex, the program validates the hex ID via binary search through the sorted array. At ~500 hexes × 8 bytes = 4,000 bytes, this fits in a single account. No Merkle proofs required.

**Water and terrain:** Ocean hexes are excluded from the valid hex set and cannot be claimed. This naturally creates strategic choke points — the English Channel separates Britain from the continent, Scandinavia connects via narrow land bridges, the Mediterranean creates natural borders. The on-chain ValidHexSet is the single source of truth for what is land and what is water.

**Adjacency:** Each hex has up to 6 neighbours (fewer at coastlines and map edges). Adjacency is precomputed off-chain alongside the valid hex set and stored directly on-chain in AdjacencySet accounts as sorted `(hex_a, hex_b)` pairs where `hex_a < hex_b` (canonical ordering). Players can only claim or attack hexes adjacent to territory they already own, validated via binary search through the on-chain adjacency data.

At resolution 4 with ~500 land hexes, the adjacency set contains approximately 1,500–2,000 undirected edges × 16 bytes = ~32,000 bytes. This may require 2–3 chunked accounts depending on account size preferences. Total map data is ~36KB, with rent of ~0.25 SOL refunded at season end.

**Season map setup:** Multi-transaction process. Admin calls `init_valid_hexes` then `append_hex_data` in chunks (limited by transaction size), then `init_adjacency` + `append_adjacency_data`, then `finalize_map_data` which sets a `map_finalized` flag on the Season account. No game instructions work until map is finalized.

**Scaling note:** This approach works well at resolution 4 (~500 hexes). At resolution 5 (~2,500 hexes, ~7,500 edges, ~120KB), you'd need to either split across more accounts or switch to Merkle proofs. That's a future decision.

**Landmarks:** Certain hexes are designated as landmarks — Paris, London, Berlin, Rome, Madrid, Amsterdam, Vienna, Stockholm, Istanbul, Moscow, etc. Landmarks generate bonus energy income (3× normal) and bonus points (5× normal). The landmark list is stored directly in the Season account (max 32 landmarks). Landmarks create high-value strategic targets that drive conflict toward recognisable geographic focal points.

### 2.2 Seasons

The game is organised into seasons. Each season is a self-contained competition with its own map state, player list, and scoring.

#### 2.2.1 Season Lifecycle

**Season Creation:** An admin creates a new season, specifying geographic bounds, H3 resolution, landmark list, timing parameters, and point thresholds. The admin then uploads the valid hex set and adjacency data on-chain via multi-transaction setup, finalizing with `finalize_map_data`. A join window opens.

**Land Rush (configurable, default 72 hours):** Players can claim any unowned land hex for a flat energy cost. No attacking is permitted during Land Rush. This allows all players to establish a starting position without being immediately attacked. Late joiners during Land Rush can still find unclaimed territory.

**War Phase:** Full gameplay. Attacking is enabled. The main phase of the game. Players accumulate points continuously from territory and landmarks.

**Escalation (activates at configurable time, default Day 21):** A single-step escalation activates: energy income multiplier increases and attack costs decrease. For v1, this is a single multiplier pair applied for the entire escalation period (e.g. energy income ×2, attack cost ×0.75). The map becomes increasingly volatile, forcing a conclusion.

**Season End:** The season ends when either:
1. A player's cumulative point total reaches the victory threshold (configurable, e.g. 50,000 points), triggering an immediate early victory, OR
2. The maximum season duration (default 28 days) expires. A crankable on-chain finalization process determines the winner.

**Post-Season:** Final standings are recorded on-chain. The crank automatically closes all Hex and Player accounts, returning rent deposits to hex owners and player wallets respectively. The Season account is retained as a permanent on-chain record. A new season can be created.

#### 2.2.2 Late Joining

Players can join a season after it has started, up to a configurable cutoff (default: Day 14). Late joiners receive bonus starting energy to partially compensate for lost time:

- Days 1–3 (Land Rush): Standard starting energy (100)
- Days 4–7: 150 starting energy
- Days 8–14: 200 starting energy
- After Day 14: Joining closed

Late joiners participate in the current phase. If Land Rush is over, they join directly into War Phase and can claim unclaimed hexes at standard cost (their first claim does not require adjacency — see Section 2.2.3).

#### 2.2.3 Respawn Mechanic

A player who loses all their hexes (hex_count drops to 0) is not eliminated. They retain their Player account, accumulated points, and any available energy. They can reclaim a foothold by making a single "free placement" claim on any unowned land hex, identical to their first Land Rush claim (no adjacency required). Subsequent claims require adjacency as normal.

This prevents the demoralising situation where a player is wiped out mid-season with no way to recover. The penalty for being wiped is severe — lost territory, lost points income, lost committed defence energy — but it is not permanent death.

The free placement is tracked via a `has_territory` flag on the Player account. When `hex_count` is 0, the next `claim_hex` call waives the adjacency requirement.

**Respawn limit:** Each player has a maximum number of respawns per season (configurable, default 3). After exhausting respawns, a player who loses all territory is effectively eliminated — they retain their Player account, accumulated points, and available energy, but cannot claim new hexes without adjacency to existing territory (which they no longer have). This prevents harassment playstyles where eliminated players endlessly re-enter to disrupt leaders.

The respawn count is tracked via `respawn_count` on the Player account and checked during `claim_hex` when the adjacency requirement would be waived.

### 2.3 Energy System

Energy is the game's single resource. It is earned passively from territory and spent on all actions.

#### 2.3.1 Energy Income

- **Standard hex:** 1 energy per hour
- **Landmark hex:** 3 energy per hour
- **Energy cap:** 500 energy maximum stored (prevents extreme hoarding, encourages regular engagement)
- **Accumulation while offline:** Energy accumulates based on territory held, up to the cap

Energy income is not tracked in real-time on-chain. Instead, energy is calculated lazily: when a player takes an action, the program computes `energy_earned = hours_since_last_action × (standard_hexes × base_rate + landmark_hexes × landmark_rate)`, adds it to their stored balance (capped at 500), then deducts the action cost. The Player account stores `last_energy_update` timestamp and the program calculates current energy on demand.

During Escalation, the energy income multiplier is applied to this calculation.

#### 2.3.2 Energy Costs

| Action | Cost |
|--------|------|
| Claim unowned hex (adjacent to your territory) | 10 energy |
| Launch attack on enemy hex | Variable (attacker chooses, minimum 10) |
| Commit defence to a hex | Energy committed is deducted from balance |
| Increase defence on a hex | Additional energy deducted from balance |
| Withdraw defence from a hex | Free, but requires revealing the commitment |

#### 2.3.3 Starting Energy

All players begin with 100 energy upon joining a season, enough to claim approximately 10 hexes during Land Rush. Late joiners receive bonus energy as described in Section 2.2.2.

#### 2.3.4 Anti-Snowball Mechanics

- **Energy cap (500):** Limits how far ahead a dominant player can stockpile
- **Perimeter scaling:** More territory means more border hexes to defend, stretching defence allocations thinner. Owning 50 hexes with 20 border hexes is harder to defend than 20 hexes with 8 border hexes
- **Escalation phase:** Increased energy income and reduced attack costs make it easier for trailing players to challenge the leader
- **Hidden defences:** Even a dominant player can be surprised by a well-timed attack on a weakly defended hex
- **Respawn:** Eliminated players can re-enter, maintaining competitive pressure

### 2.4 Combat System

#### 2.4.1 Attacking

To attack an enemy hex, a player must:
1. Own at least one hex adjacent to the target (validated via on-chain adjacency data)
2. Have sufficient energy (minimum 10, adjusted during Escalation)

The player submits a `launch_attack` transaction specifying the target hex, origin hex, adjacency proof, and energy committed. The committed energy is immediately deducted from their available balance. The attack is publicly visible on-chain — all players can see who is attacking which hex with how much energy.

**One active attack per hex.** A hex can only have one pending attack at a time. If a hex is already under attack, additional attacks are rejected until the first resolves. This eliminates resolution-ordering exploits, reduces edge cases, and keeps the game legible. The 6-hour window means hexes are "locked" for at most 6 hours between attacks.

A countdown begins from the moment the attack is launched. The base countdown is 6 hours, extended to 12 hours if the attack lands during the defender's timezone shield window (see Section 2.4.5).

#### 2.4.2 Defending

Defenders have hidden energy allocations across their hexes (see Section 2.5). When attacked, the defender must come online within the countdown window and submit a `reveal_defence` transaction for the targeted hex. This reveals their committed energy for that specific hex. The program verifies the reveal matches the original Pedersen commitment.

#### 2.4.3 Resolution

**If the defender reveals within the deadline:**

- **Attacker energy > Defender energy:** Attacker wins. Hex ownership flips to attacker. The attacker's surplus energy (attack energy minus defender energy) is returned to the attacker's available balance. The hex becomes undefended but protected by the occupation shield (Section 2.4.6). The defender's committed energy for that hex is lost.
- **Attacker energy ≤ Defender energy:** Defender wins. Hex ownership remains. The defender's revealed `energy_amount` is deducted from their `energy_committed` (commitment consumed — they must recommit). The attacker loses all committed energy (already deducted at launch). A 60-minute combat cooldown is applied to the hex (`last_combat_resolved` timestamp set).

**If the defender does not reveal within the deadline:**

Attacker wins by default. Hex ownership flips regardless of what the hidden allocation was. The defender's committed energy for that hex is lost (phantom energy — see Section 3.2.3). Anyone can call `resolve_timeout` to execute this after the deadline. Energy returned to attacker = `max(0, energy_committed - season.min_attack_energy)` — the attacker always loses at least `min_attack_energy` (default 10), preventing free griefing spam.

#### 2.4.4 Post-Combat

After combat resolution (whether via reveal or timeout), the hex's defence commitment is cleared. The new owner (or existing owner after a successful defence) must submit a fresh commitment to defend the hex.

Every combat interaction reveals information. If the defender reveals, the attacker learns the exact defence value of that hex. If the defender doesn't reveal, everyone learns that the defender was offline or chose not to defend. This information leakage is a core part of the strategic texture — it makes the game more interesting over time as players build models of each other's behaviour.

#### 2.4.5 Timezone Shield

To prevent the game from degenerating into "who sleeps least wins," each player can configure a daily timezone shield — a 6-hour window (e.g. 23:00–05:00 UTC) during which attacks against their hexes have their resolution deadline extended from 6 hours to 12 hours.

The shield window is stored in the Player account as `shield_start_hour` (0–23 UTC) and is 6 hours long. When `launch_attack` creates an Attack account, the program checks whether the current timestamp falls within the defender's shield window. If so, the deadline is set to `now + 12 hours` instead of `now + 6 hours`.

Players can change their shield window at any time, but changes take effect after a 24-hour delay to prevent tactical abuse (e.g. seeing an incoming attack and instantly shifting your shield to cover it).

**Strategic note:** The shield extension triggers based on whether the attack is *launched* during the defender's shield window, not whether the *deadline* falls within it. This means a sophisticated attacker can choose to launch attacks just outside the shield window to force the shorter 6-hour deadline. This is intentional — the shield is designed as a sleep-protection safety net, not an impenetrable fortress. Players who are aware of this timing dynamic can use shield window visibility (all players' shield hours are public) as strategic information, and defenders can set their shield window to cover the period when they are least able to respond, accepting that the boundaries are soft.

Default shield: 22:00–04:00 UTC (covers European nighttime). Players can adjust to their actual timezone.

#### 2.4.6 Occupation Shield and Combat Cooldown

Post-combat cooldowns prevent immediate re-attacks and reward active defence:

- **Attacker wins (capture):** 30-minute occupation shield (hex cannot be attacked)
- **Defender wins (successful defence):** 60-minute combat cooldown (hex cannot be attacked)
- **Timeout (attacker wins by default):** 30-minute occupation shield

The occupation shield is implemented as a `last_owner_change` timestamp on the Hex account. The combat cooldown uses a `last_combat_resolved` timestamp. The `launch_attack` instruction checks both before allowing an attack.

Successful defence is rewarded with MORE protection than a capture. Failed attackers can't immediately retry. Defenders get breathing room to recommit.

**Cooldown configurability:** Both `defender_win_cooldown_seconds` (default 3600) and `capture_cooldown_seconds` (default 1800) are configurable per season. Note: `occupation_shield_seconds` controls the `last_owner_change` check, while `capture_cooldown_seconds` controls the `last_combat_resolved` check. Both apply after a capture (both timestamps are set), so the effective post-capture cooldown is `max(occupation_shield_seconds, capture_cooldown_seconds)`. With defaults both are 30 minutes, so they overlap. The defender win cooldown (60 min) only uses `last_combat_resolved`.

### 2.5 Hidden Defence Mechanic

This is the core strategic innovation of Solvasion. Every player can see the map — who owns what — but nobody can see how a player has distributed their defensive energy across their hexes.

#### 2.5.1 Cryptographic Scheme

Defence allocations are hidden using Pedersen commitments on Ristretto255, providing information-theoretic hiding of per-hex amounts even against observers who index all transaction data on-chain.

**Commitment construction:**

```
C = a·G + r·H
```

Where:
- `a` = defence energy amount (u32, interpreted as scalar)
- `r` = blinding factor (scalar, derived deterministically — see Section 2.5.2)
- `G` = Ristretto255 basepoint
- `H` = fixed, program-wide secondary generator

**Secondary generator H** is derived deterministically via hash-to-Ristretto:

```
H = HashToRistretto("Solvasion:DefenceCommitment:H:v1")
```

The resulting compressed point bytes are hardcoded in the program to avoid ambiguity. H is a nothing-up-my-sleeve point — nobody knows the discrete log relationship between G and H, which is what makes the commitment scheme hiding.

**Commitment encoding:** Stored as compressed Ristretto255 point bytes: `[u8; 32]`.

**Verification (on-chain):** To verify an opening `(a, r)`:
1. Compute `C' = a·G + r·H`
2. Verify `compress(C') == stored_commitment`

Range check: `a <= season.energy_cap` (u32 type ensures non-negative).

**Why Pedersen over SHA256?** In v1.1, SHA256 commitments were computationally hiding but the per-hex energy amounts appeared in plaintext as transaction arguments (the `total_delta` approach hid only the per-hex breakdown, not individual amounts in multi-hex commits). Pedersen commitments are information-theoretically hiding — even with unlimited computation, an observer cannot determine `a` from `C` without knowing `r`. This eliminates the need for the `total_delta` workaround entirely.

#### 2.5.2 Secret / Randomness Management

**Season secret seed (unchanged from v1.1):** When a player joins a season, they derive a single secret seed by signing a fixed message with their wallet:

```
seed = SHA256(wallet_sign("Solvasion season seed:" || season_id))
```

This signature is performed once, client-side. The seed is stored in the browser (or can be regenerated on any device by re-signing the same message with the same wallet).

**Deterministic blinding factor derivation:** Per-hex blinding factors are derived deterministically from the seed, avoiding the need to store secrets per hex:

```
r = HashToScalar(SHA256(seed || "defence_r" || season_id || hex_id || nonce))
```

Where `nonce` is the value of the player's `commitment_nonce` at the time of commitment. The program enforces that client-supplied nonces match `player.commitment_nonce` (for `commit_defence`) or `player.commitment_nonce + 1` through `player.commitment_nonce + N` for batch operations. After each commitment operation, `player.commitment_nonce` is incremented by the number of commitments created or replaced.

The per-hex `defence_nonce` stored on the Hex account is a snapshot of the nonce used for that specific hex's current commitment. This enables recovery: a player on a new device can enumerate their owned hexes, read each hex's `defence_nonce`, and re-derive the corresponding blinding factor from `(seed, hex_id, defence_nonce)`. Combined with the locally tracked energy amount, this reconstructs the full opening.

**Nonce invariant:** For any given `(player, season, hex)`, the `defence_nonce` is unique across the lifetime of the season. Because `commitment_nonce` is strictly monotonic and enforced on-chain, and `defence_nonce` is set from `commitment_nonce` at commit time, no two commitments for the same hex can share a nonce. This guarantees unique blinding factors per commitment.

#### 2.5.3 Committing Defences

A player allocates energy from their available balance to defend specific hexes. For each hex they wish to defend, they:

1. Choose a defence amount `a_i`
2. Derive the blinding factor `r_i` from `(seed, hex_id, nonce)`
3. Compute the Pedersen commitment `C_i = a_i·G + r_i·H`
4. Submit `(hex_id, C_i, nonce)` on-chain

The player submits a `commit_defence` transaction containing:
- An array of `(hex_id, commitment, nonce)` entries
- `total_energy_delta` — total energy being committed across all hexes in this batch

The program deducts `total_energy_delta` from the player's `energy_balance` and adds it to `energy_committed`. The per-hex breakdown is never submitted in plaintext — only the Pedersen commitments and the aggregate delta.

**Information available to observers:**
- **On-chain state:** Each Hex has a Pedersen commitment (opaque 32 bytes). The Player has a total `energy_committed`.
- **Public information:** Player X has committed N total energy. Hex Y has a commitment.
- **Hidden information:** How much of N is allocated to hex Y vs hex Z. Even indexing all transaction data reveals nothing about per-hex amounts, because the commitments are information-theoretically hiding.
- **Verification:** On reveal, the program verifies the Pedersen opening and deducts the revealed amount from the player's `energy_committed` total.

**The accounting constraint (unchanged from v1.1):** The program cannot verify that the sum of all per-hex commitments equals the declared total, because it never sees the per-hex amounts. A player who over-allocates in their commitments will fail when reveals cause `energy_committed` to go negative. The player is only cheating themselves.

**Defence energy is locked.** Energy committed to defence cannot be freely returned to available balance. To unlock committed energy, a player must either:
- **Withdraw:** Reveal the commitment via `withdraw_defence` (exposes the allocation), or
- **Defend:** The commitment is consumed during combat resolution via `reveal_defence`

#### 2.5.4 Increasing Defences (Add-Only)

A key advantage of Pedersen commitments is the ability to reinforce a hex without revealing the existing allocation.

The `increase_defence` instruction allows a player to add energy to an already-defended hex:
1. The player computes a new commitment `C_new` reflecting the new total `(a_old + delta)`
2. They submit `(hex_id, C_new, new_nonce, delta)` on-chain
3. The program replaces the stored commitment and deducts `delta` from `energy_balance`

**No verification of the old commitment occurs.** The program cannot check that `C_new` correctly reflects `C_old + delta` without revealing `a_old` (which would defeat the purpose). The same trust model as committing applies — a player who creates an inconsistent commitment only harms themselves when they try to reveal.

**Information leakage (intentional feature):** The `delta` value is visible in the transaction, so observers learn that "Player X reinforced hex Y by delta energy." They do not learn the new total. Repeated increases build a lower bound on a hex's defence, which creates interesting strategic dynamics — visible reinforcement serves as a **deterrent signal**. This is framed in the UI as a deliberate strategic choice: "Reinforcing signals commitment — opponents can see you reinforced this hex." Players who want to reallocate secretly must use `withdraw_defence` + `commit_defence` instead, accepting the information leakage on the old amount.

**Decreasing or reallocating:** To reduce a hex's defence or move energy elsewhere, the player must use `withdraw_defence` (which reveals the full amount) and then `commit_defence` to the new allocation. There is no way to decrease without revealing.

#### 2.5.5 Additive Commits

Defence commitments are additive, not replacement-based. Each `commit_defence` call adds new commitments to specified hexes without affecting other hexes. If a hex already has a commitment, the player must either use `increase_defence` (to add without revealing) or `withdraw_defence` followed by a new `commit_defence` (to reallocate, with information leakage).

For convenience, a `recommit_defence` instruction combines withdraw and commit in a single transaction: the player reveals the old commitment (providing blinding factor and old energy amount) and submits a new commitment with a new energy delta in one atomic operation. This is useful when reallocating energy between hexes, accepting the information leakage on the old allocation.

#### 2.5.6 Commitment Integrity

The Pedersen commitment scheme inherently binds the commitment to a specific energy amount and blinding factor. Additionally:
- **Replay prevention:** The `defence_nonce` stored on the Hex account ensures each commitment uses a unique blinding factor
- **Hex binding:** Each commitment is stored on a specific Hex PDA — a commitment from hex A cannot be claimed for hex B
- **Player binding:** Only the hex owner can reveal (the program checks `hex.owner == caller`)

#### 2.5.7 Attack Locking

When a hex is under active attack, its commitment is locked. The owner cannot withdraw, increase, or replace the commitment until the attack resolves. This prevents defenders from seeing an incoming attack and tactically redistributing.

### 2.6 Points and Victory

#### 2.6.1 Point Accumulation

Points accumulate continuously based on territory held:
- **Standard hex:** 1 point per hour
- **Landmark hex:** 5 points per hour

Like energy, points are calculated lazily on-chain. When any relevant action occurs, the program calculates `points_earned = hours_since_last_update × (standard_hexes × 1 + landmark_hexes × 5)` and updates the player's total.

#### 2.6.2 Victory Conditions

The season ends when either:
1. **Early victory:** A player's cumulative points reach the victory threshold (configurable, default 50,000). The `claim_victory` instruction can be called by anyone, triggering score recalculation for the leading player and ending the season if the threshold is met.
2. **Time expiry:** The maximum season duration (default 28 days) elapses. Anyone can call `end_season`, which sets the phase to Ended. A crankable finalization process then determines the winner (see Section 3.3.12).

#### 2.6.3 Scoring and Standings

Final standings are determined by cumulative points. Ties are broken by:
1. Most hexes owned at season end
2. Most landmark hexes owned at season end
3. Earlier join time (first to join wins ties)

#### 2.6.4 Rewards

**On-chain achievements:** Season results are permanently recorded in Reputation accounts that persist across seasons. Winner, top finishers, and notable stats are written to these accounts.

**Winner NFT (v2 feature):** A unique NFT minted to the season winner containing a snapshot of the final map state.

### 2.7 NFT Banner System

#### 2.7.1 Selecting a Banner

When joining a season, a player can optionally select an NFT from their wallet to use as their banner. The frontend reads the player's token accounts, displays their NFTs, and the player picks one. The mint address of the chosen NFT is stored on-chain in the Player account.

The program verifies that the player's wallet holds a token account for the specified NFT mint with a balance of 1 at the time of setting the banner. If the player later sells or transfers the NFT, their banner remains set (snapshot, not live link) but they cannot change it to a new NFT they don't hold.

A player can change their banner at any time during the season via `set_banner`. Players without NFTs or who choose not to set a banner get a default colour assigned based on their wallet address.

#### 2.7.2 Frontend Rendering

The banner NFT image is fetched from its Metaplex metadata URI by the frontend.

**Mosaic mode (contiguous territory < 10 hexes):** The NFT image is tiled into each hex individually, scaled and clipped to fit the hexagonal shape.

**Stretched mode (contiguous territory ≥ 10 hexes):** The NFT image is stretched across the bounding box of the contiguous territory blob and clipped to the combined hex boundaries. The image emerges as territory grows — at 10 hexes it's partially visible, at 30+ hexes the full image is clear.

The threshold and rendering behaviour are entirely frontend concerns with no on-chain component.

**Fallback:** If no banner is set, hexes are coloured with a deterministic colour derived from the player's wallet address (first 3 bytes of the pubkey mapped to RGB).

---

## 3. On-Chain Program Architecture

### 3.1 Program Overview

The Solvasion program is a Solana program built with the Anchor framework. All game logic and state lives on-chain. The program is the sole authority over game outcomes — no backend server can alter results.

### 3.2 Account Structures

#### 3.2.1 GlobalConfig

**PDA seed:** `["global_config"]`

Singleton account storing program-wide configuration.

| Field | Type | Description |
|-------|------|-------------|
| `admin` | `Pubkey` | Authority for creating seasons and updating config |
| `season_counter` | `u64` | Incrementing counter for unique season IDs |
| `paused` | `bool` | Emergency pause flag |

**Size:** ~50 bytes

#### 3.2.2 Season

**PDA seed:** `["season", season_id.to_le_bytes()]`

One per season. Stores all season configuration and state. Not closed at season end — serves as permanent record.

| Field | Type | Description |
|-------|------|-------------|
| `season_id` | `u64` | Unique season identifier |
| `admin` | `Pubkey` | Season creator/admin |
| `phase` | `enum` | `LandRush`, `War`, `Escalation`, `Ended` |
| `created_at` | `i64` | Unix timestamp |
| `land_rush_end` | `i64` | Timestamp when Land Rush ends |
| `war_start` | `i64` | Timestamp when War phase begins (= land_rush_end) |
| `escalation_start` | `i64` | Timestamp when Escalation activates |
| `season_end` | `i64` | Maximum season end timestamp |
| `join_cutoff` | `i64` | Last timestamp for new players to join |
| `actual_end` | `Option<i64>` | When the season actually ended |
| `h3_resolution` | `u8` | H3 grid resolution (e.g. 4) |
| `map_finalized` | `bool` | Whether hex/adjacency data has been finalized |
| `energy_per_hex_per_hour` | `u16` | Base energy income rate |
| `energy_per_landmark_per_hour` | `u16` | Landmark energy income rate |
| `energy_cap` | `u32` | Maximum stored energy |
| `starting_energy` | `u32` | Energy given to new joiners |
| `claim_cost` | `u32` | Energy cost to claim unowned hex |
| `min_attack_energy` | `u32` | Minimum energy for an attack |
| `base_attack_window` | `i64` | Base seconds defender has to reveal (e.g. 21600 = 6 hours) |
| `extended_attack_window` | `i64` | Extended window during shield hours (e.g. 43200 = 12 hours) |
| `occupation_shield_seconds` | `i64` | Post-capture attack immunity (e.g. 1800 = 30 minutes) |
| `defender_win_cooldown_seconds` | `i64` | Post-successful-defence cooldown (default 3600 = 60 min) |
| `capture_cooldown_seconds` | `i64` | Post-capture/timeout cooldown (default 1800 = 30 min) |
| `max_respawns_per_season` | `u8` | Maximum free placement claims after losing all territory (default 3) |
| `points_per_hex_per_hour` | `u16` | Standard hex point rate |
| `points_per_landmark_per_hour` | `u16` | Landmark hex point rate |
| `victory_threshold` | `u64` | Points needed for early victory |
| `escalation_energy_multiplier_bps` | `u16` | Energy multiplier in basis points (e.g. 20000 = 2×) |
| `escalation_attack_cost_multiplier_bps` | `u16` | Attack cost multiplier (e.g. 7500 = 0.75×) |
| `winner` | `Option<Pubkey>` | Winning player's wallet (set on season end) |
| `winning_score` | `u64` | Winner's final score |
| `finalization_leader` | `Option<Pubkey>` | Current leader during finalization crank |
| `finalization_leader_score` | `u64` | Current leader's score during finalization |
| `finalization_complete` | `bool` | Whether finalization has been completed |
| `cleanup_complete` | `bool` | Whether post-season account closure is complete |
| `landmark_count` | `u8` | Number of landmark hexes |
| `landmarks` | `[u64; 32]` | H3 indices of landmark hexes (max 32) |

**Size:** ~677 bytes

#### 3.2.3 Player

**PDA seed:** `["player", season_id.to_le_bytes(), player_pubkey]`

One per player per season. Closed after season ends and reputation is updated.

| Field | Type | Description |
|-------|------|-------------|
| `player` | `Pubkey` | Player's wallet |
| `season_id` | `u64` | Season this player belongs to |
| `energy_balance` | `u32` | Available (uncommitted) energy |
| `energy_committed` | `u32` | Total energy locked in defence commitments |
| `last_energy_update` | `i64` | Timestamp of last energy calculation |
| `hex_count` | `u32` | Number of hexes currently owned |
| `landmark_count` | `u8` | Number of landmark hexes owned |
| `points` | `u64` | Cumulative points earned |
| `last_points_update` | `i64` | Timestamp of last points calculation |
| `banner_nft` | `Option<Pubkey>` | Mint address of chosen banner NFT |
| `joined_at` | `i64` | Timestamp of joining the season |
| `commitment_nonce` | `u64` | Incrementing nonce for deterministic blinding factor derivation |
| `shield_start_hour` | `u8` | UTC hour (0–23) when timezone shield begins |
| `shield_change_at` | `Option<i64>` | Timestamp when a pending shield change takes effect |
| `pending_shield_hour` | `u8` | Pending new shield start hour |
| `attacks_launched` | `u32` | Total attacks launched (stats) |
| `attacks_won` | `u32` | Total attacks won (stats) |
| `defences_made` | `u32` | Total defences revealed (stats) |
| `defences_won` | `u32` | Total defences won (stats) |
| `finalized` | `bool` | Whether this player's score has been finalized for season end |
| `phantom_energy` | `u32` | Estimated energy locked in lost hex commitments (for UI display) |
| `respawn_count` | `u8` | Number of times this player has used free placement after being wiped |

**Size:** ~196 bytes

#### 3.2.4 Hex

**PDA seed:** `["hex", season_id.to_le_bytes(), hex_id.to_le_bytes()]`

One per owned hex per season. Created when a hex is first claimed, closed when a season ends (rent returned to current owner).

| Field | Type | Description |
|-------|------|-------------|
| `hex_id` | `u64` | H3 index of this hex |
| `season_id` | `u64` | Season this hex belongs to |
| `owner` | `Pubkey` | Current owner's wallet |
| `is_landmark` | `bool` | Whether this is a landmark hex |
| `defence_commitment` | `[u8; 32]` | Compressed Ristretto255 point (Pedersen commitment) |
| `has_commitment` | `bool` | Whether a defence commitment exists |
| `defence_nonce` | `u64` | Nonce used for this commitment's blinding factor derivation (0 if none) |
| `claimed_at` | `i64` | Timestamp when first claimed |
| `last_owner_change` | `i64` | Timestamp of most recent ownership change |
| `last_combat_resolved` | `i64` | Timestamp of most recent combat resolution (for outcome-dependent cooldown) |
| `under_attack` | `bool` | Whether there's an active attack on this hex |
| `commitment_locked` | `bool` | Whether commitment is locked due to active attack |

**Size:** ~128 bytes

#### 3.2.5 Attack

**PDA seed:** `["attack", season_id.to_le_bytes(), attack_id.to_le_bytes()]`

One per active attack. Created when an attack is launched, closed when resolved.

| Field | Type | Description |
|-------|------|-------------|
| `attack_id` | `u64` | Unique attack identifier (from Season.next_attack_id) |
| `season_id` | `u64` | Season |
| `attacker` | `Pubkey` | Attacker's wallet |
| `target_hex` | `u64` | H3 index of target hex |
| `origin_hex` | `u64` | H3 index of hex attack launched from |
| `energy_committed` | `u32` | Energy committed to attack |
| `defender` | `Pubkey` | Defender's wallet (owner of target at time of attack) |
| `launched_at` | `i64` | Timestamp of attack launch |
| `deadline` | `i64` | Timestamp by which defender must reveal |
| `resolved` | `bool` | Whether this attack has been resolved |
| `result` | `enum` | `Pending`, `AttackerWon`, `DefenderWon`, `DefaultWin` |

**Size:** ~160 bytes

#### 3.2.6 Reputation

**PDA seed:** `["reputation", player_pubkey]`

Persistent across seasons. One per player wallet. Tracks lifetime stats. Never closed.

| Field | Type | Description |
|-------|------|-------------|
| `player` | `Pubkey` | Player's wallet |
| `seasons_played` | `u32` | Total seasons participated in |
| `seasons_won` | `u32` | Total season victories |
| `total_hexes_captured` | `u64` | Lifetime hexes captured |
| `total_attacks_launched` | `u64` | Lifetime attacks |
| `total_attacks_won` | `u64` | Lifetime attacks won |
| `total_defences_made` | `u64` | Lifetime defences |
| `total_defences_won` | `u64` | Lifetime defences won |
| `best_season_rank` | `u32` | Best finishing position |
| `best_season_score` | `u64` | Highest score in a single season |

**Size:** ~120 bytes

#### 3.2.7 SeasonCounters

**PDA seed:** `["season_counters", season_id.to_le_bytes()]`

Separate PDA for high-frequency write counters, solving Season account write contention. Created alongside Season. Closed at season end (rent refunded to admin).

| Field | Type | Description |
|-------|------|-------------|
| `season_id` | `u64` | Season |
| `player_count` | `u32` | Number of joined players |
| `total_hexes_claimed` | `u32` | Total hexes currently owned |
| `next_attack_id` | `u64` | Incrementing attack counter |
| `finalized_count` | `u32` | Number of players finalized during crank processing |

**Size:** ~24 bytes

**Effect:** Season account becomes effectively read-only after creation (only written on phase changes and finalization). All high-frequency writes go to SeasonCounters. Instructions that only need to read season config (energy rates, timing, etc.) don't take a write lock on a contended account.

#### 3.2.8 ValidHexSet

**PDA seed:** `["valid_hexes", season_id.to_le_bytes(), chunk_index]`

Stores sorted array of valid H3 hex IDs for binary search validation. Created during season setup.

| Field | Type | Description |
|-------|------|-------------|
| `season_id` | `u64` | Season |
| `hex_count` | `u32` | Number of valid hexes in this chunk |
| `hex_ids` | `[u64; N]` | Sorted array of valid H3 indices |

**Size:** ~4,000 bytes (500 hexes × 8 bytes)

#### 3.2.9 AdjacencySet

**PDA seed:** `["adjacency", season_id.to_le_bytes(), chunk_index]`

Stores sorted array of adjacency edges as `(hex_a, hex_b)` pairs where `hex_a < hex_b`. May require 2–3 chunks. Created during season setup.

| Field | Type | Description |
|-------|------|-------------|
| `season_id` | `u64` | Season |
| `edge_count` | `u32` | Number of edges in this chunk |
| `edges` | `[(u64, u64); N]` | Sorted array of (hex_a, hex_b) pairs |

**Size:** ~32,000 bytes (~2,000 edges × 16 bytes)

**Validation method:** Binary search through sorted arrays. No hashing, no proofs.

**Chunk routing:** When multiple AdjacencySet chunks exist, each chunk stores a contiguous sorted range of edges. The first and last edge in each chunk define its range. The client determines the correct chunk by computing the canonical edge `(min(hex_a, hex_b), max(hex_a, hex_b))` and selecting the chunk whose range contains that edge. Chunk indices are sequential (0, 1, 2, ...) and the client can read chunk boundaries from the first/last entries via a single RPC call per chunk at session start, caching them locally.

The program validates that the queried edge falls within the passed chunk's range before performing the binary search. If the edge is not within the chunk's range, the instruction fails with `EdgeNotInChunk` error.

### 3.3 Instruction Set

#### 3.3.1 `initialize`

**Purpose:** One-time program setup. Creates GlobalConfig.

**Accounts:** admin (signer, payer), global_config (PDA, init), system_program

**Logic:**
- Set admin pubkey
- Set season_counter to 0
- Set paused to false

#### 3.3.2 `create_season`

**Purpose:** Admin creates a new season with configuration parameters.

**Accounts:** admin (signer, payer), global_config (mut), season (PDA, init), system_program

**Parameters:** All timing parameters, energy rates, point rates, victory threshold, H3 resolution, landmark list

**Logic:**
- Verify caller is admin
- Verify program not paused
- Increment global season_counter, use as season_id
- Initialise Season account with all parameters
- Create SeasonCounters account (next_attack_id = 0, player_count = 0, total_hexes_claimed = 0)
- Set phase to LandRush
- Set map_finalized to false
- Set cleanup_complete to false
- Validate all parameters within acceptable ranges
- Map data uploaded separately via `init_valid_hexes`/`append_hex_data`/`init_adjacency`/`append_adjacency_data`/`finalize_map_data`

#### 3.3.3 `join_season`

**Purpose:** Player joins an active season.

**Accounts:** player_wallet (signer, payer), season (read), season_counters (mut), player (PDA, init), system_program

**Parameters:** `season_id`

**Logic:**
- Verify season exists and has not ended
- Verify map_finalized is true
- Verify current timestamp is before join_cutoff
- Verify player hasn't already joined (PDA would already exist)
- Create Player account
- Set starting energy based on join timing (100 base, bonus for late joiners per Section 2.2.2)
- Increment season_counters.player_count
- Set default shield_start_hour to 22 (22:00 UTC)
- Initialise all stats to 0, finalized to false, phantom_energy to 0

#### 3.3.4 `set_banner`

**Purpose:** Player sets or changes their NFT banner.

**Accounts:** player_wallet (signer), player (mut), nft_mint, nft_token_account, token_program

**Parameters:** `season_id`, `nft_mint`

**Logic:**
- Verify player is in this season
- Verify player_wallet owns a token account for nft_mint with balance ≥ 1
- Set player.banner_nft to Some(nft_mint)

#### 3.3.5 `set_shield`

**Purpose:** Player configures their timezone shield window.

**Accounts:** player_wallet (signer), player (mut)

**Parameters:** `season_id`, `shield_start_hour` (0–23)

**Logic:**
- Verify player is in this season
- Verify shield_start_hour is 0–23
- Set player.pending_shield_hour to shield_start_hour
- Set player.shield_change_at to now + 86400 (24-hour delay)
- On every subsequent instruction involving this player, check if shield_change_at has passed and apply the change

#### 3.3.6 `claim_hex`

**Purpose:** Claim an unowned hex adjacent to existing territory.

**Accounts:** player_wallet (signer, payer), season (read), season_counters (mut), player (mut), hex (PDA, init), valid_hex_set (read), adjacency_set (read, if adjacency required), system_program. If adjacency required: adjacent_hex (read).

**Parameters:** `season_id`, `hex_id`, `adjacent_hex_id` (if required), `adjacency_chunk_index: u8` (if adjacency required)

**Logic:**
- Determine effective season phase from timestamps
- Verify map_finalized is true
- Recalculate player energy (lazy update)
- Verify player has sufficient energy (≥ claim_cost, adjusted for escalation)
- Verify hex_id is in the valid hex set (binary search through valid_hex_set.hex_ids)
- Verify hex is not already owned (Hex PDA doesn't exist)
- **Adjacency check:**
    - If player hex_count == 0 (first claim, Land Rush, or respawn):
        - If player has never owned a hex (first claim): adjacency waived
        - If player previously owned hexes (respawn): verify respawn_count < season.max_respawns_per_season. If so, waive adjacency and increment respawn_count. If not, reject with `RespawnLimitExceeded` error.
    - Otherwise: verify adjacent_hex is owned by player AND verify the edge (min(hex_id, adjacent_hex_id), max(hex_id, adjacent_hex_id)) via binary search through adjacency_set.edges
- Deduct claim_cost from player energy
- Create Hex account with owner set to player
- Set defence_nonce to 0
- Check if hex_id is in season.landmarks array — set is_landmark accordingly
- Increment player hex_count (and landmark_count if landmark)
- Update season_counters.total_hexes_claimed
- Emit `HexClaimed` event

#### 3.3.7 `commit_defence`

**Purpose:** Player submits hidden Pedersen commitment defence allocations for one or more hexes.

**Accounts:** player_wallet (signer), season (read), player (mut), plus remaining accounts: one Hex account (mut) per hex being defended

**Parameters:** `season_id`, `commitments: Vec<(u64, [u8; 32], u64)>` (array of hex_id + compressed Ristretto commitment + nonce), `total_energy_delta: u32` (net energy being added to committed total)

**Logic:**
- Verify season is in War or Escalation phase
- Recalculate player energy
- Verify player has sufficient available energy (energy_balance ≥ total_energy_delta)
- For each commitment entry at index i:
    - Verify entry nonce == player.commitment_nonce + i
    - Verify hex exists and is owned by player
    - Verify hex is not commitment_locked (under active attack)
    - Verify hex does not already have a commitment (use increase_defence, withdraw_defence, or recommit_defence first)
    - Set hex.defence_commitment to the provided compressed Ristretto point
    - Set hex.has_commitment to true
    - Set hex.defence_nonce to entry nonce
- After all commitments processed:
    - Set player.commitment_nonce += len(commitments)
- Deduct total_energy_delta from player.energy_balance
- Add total_energy_delta to player.energy_committed
- Emit `DefencesCommitted` event

**Client responsibilities:** For each defended hex, the client chooses `a_i`, derives `r_i` from `(seed, hex_id, nonce)`, computes `C_i = a_i·G + r_i·H`, and sends `(hex_id, C_i, nonce)`. The program never sees `a_i` or `r_i`.

#### 3.3.8 `withdraw_defence`

**Purpose:** Player voluntarily reveals and reclaims defence energy from a hex.

**Accounts:** player_wallet (signer), season (read), player (mut), hex (mut)

**Parameters:** `season_id`, `hex_id`, `energy_amount: u32`, `blind: [u8; 32]` (blinding factor scalar bytes)

**Logic:**
- Verify hex is owned by player
- Verify hex has a commitment
- Verify hex is not commitment_locked
- Verify Pedersen opening: compute `C' = energy_amount·G + blind·H`, verify `compress(C') == hex.defence_commitment`
- Clear hex.defence_commitment to zeroes, set has_commitment to false, set defence_nonce to 0
- Deduct energy_amount from player.energy_committed
- Add energy_amount to player.energy_balance (capped at energy_cap)
- Emit `DefenceWithdrawn` event

**Note:** This reveals the allocation. Other players watching the chain will see the energy amount. This is the cost of reclaiming defence energy — information leakage.

#### 3.3.9 `recommit_defence`

**Purpose:** Atomic withdraw + commit for updating a hex's defence. Combines reveal of old commitment with submission of new commitment in one transaction.

**Accounts:** player_wallet (signer), season (read), player (mut), hex (mut)

**Parameters:** `season_id`, `hex_id`, `old_energy_amount: u32`, `old_blind: [u8; 32]`, `new_commitment: [u8; 32]`, `new_nonce: u64`, `energy_delta: i32` (signed: positive = adding more, negative = reducing)

**Logic:**
- Verify hex is owned by player and has a commitment
- Verify hex is not commitment_locked
- Verify new_nonce == player.commitment_nonce
- Verify Pedersen opening of old commitment
- Clear old commitment
- Set new commitment and hex.defence_nonce to new_nonce
- Apply energy_delta to player balances (energy_balance and energy_committed)
- Set player.commitment_nonce += 1
- Emit `DefenceRecommitted` event

**Security note:** The old energy amount is revealed in this transaction. The player is choosing to update their defence and accepting the information leakage. The new commitment remains hidden.

#### 3.3.10 `increase_defence`

**Purpose:** Reinforce a hex's defence without revealing the existing allocation. Add-only — the defence can only increase, not decrease.

**Accounts:** player_wallet (signer), season (read), player (mut), hex (mut)

**Parameters:** `season_id`, `hex_id`, `new_commitment: [u8; 32]` (new compressed Ristretto point reflecting the increased total), `new_nonce: u64`, `delta: u32` (must be > 0)

**Logic:**
- Verify hex is owned by player
- Verify hex has an existing commitment (has_commitment == true)
- Verify hex is not commitment_locked (not under active attack)
- Verify new_nonce == player.commitment_nonce
- Recalculate player energy (lazy update)
- Verify player has sufficient available energy (energy_balance ≥ delta)
- Deduct delta from player.energy_balance
- Add delta to player.energy_committed
- Set hex.defence_commitment to new_commitment
- Set hex.defence_nonce to new_nonce
- Set player.commitment_nonce += 1
- Emit `DefenceIncreased` event (includes delta)

**No verification that the new commitment correctly reflects the old amount plus delta.** The program cannot verify this without revealing the old amount. Same trust model as `commit_defence` — inconsistent commitments only harm the player on reveal.

**Client behaviour:** The client tracks the current defence amount locally. New total `a_new = a_old + delta`. Derive `r_new` from `(seed, hex_id, new_nonce)`. Compute `C_new = a_new·G + r_new·H`.

#### 3.3.11 `launch_attack`

**Purpose:** Attack an enemy hex.

**Accounts:** player_wallet (signer, payer), season (read), season_counters (mut), player_attacker (mut), player_defender (read), hex_target (mut), hex_origin (read), adjacency_set (read), attack (PDA, init), system_program

**Parameters:** `season_id`, `target_hex_id`, `origin_hex_id`, `energy_committed`, `adjacency_chunk_index: u8`

**Logic:**
- Verify season is in War or Escalation phase (from timestamps)
- Recalculate attacker energy
- Verify energy_committed ≥ min_attack_energy (adjusted for escalation)
- Verify attacker has sufficient available energy
- Verify origin_hex is owned by attacker
- Verify target_hex is owned by someone else (the defender)
- Verify adjacency: binary search for edge (min(origin, target), max(origin, target)) in adjacency_set.edges
- **Verify hex is not under attack** (hex.under_attack must be false)
- **Verify occupation shield has expired:** `now - hex.last_owner_change > season.occupation_shield_seconds`
- **Verify combat cooldown has expired:**
    - Read hex.last_combat_resolved
    - Determine applicable cooldown: if hex ownership changed at last_combat_resolved (last_owner_change == last_combat_resolved), use season.capture_cooldown_seconds; otherwise use season.defender_win_cooldown_seconds
    - Verify now - hex.last_combat_resolved > applicable cooldown
- Deduct energy_committed from attacker's energy_balance
- Generate attack_id from season_counters.next_attack_id, increment next_attack_id
- Calculate deadline:
    - Check if current time falls within defender's shield window (defender's shield_start_hour to shield_start_hour + 6, wrapping at 24)
    - If within shield: deadline = now + season.extended_attack_window
    - If outside shield: deadline = now + season.base_attack_window
- Create Attack account
- Set hex.under_attack = true, hex.commitment_locked = true
- Emit `AttackLaunched` event with attacker, target_hex, energy, defender, deadline

#### 3.3.12 `reveal_defence`

**Purpose:** Defender reveals their hidden allocation for an attacked hex, resolving combat.

**Accounts:** player_wallet (signer), season (read), player_defender (mut), player_attacker (mut), hex (mut), attack (mut)

**Parameters:** `season_id`, `attack_id`, `energy_amount: u32`, `blind: [u8; 32]` (blinding factor scalar bytes)

**Logic:**
- Verify caller is the defender (matches attack.defender)
- Verify attack is not already resolved
- Verify current time is before attack.deadline
- Verify Pedersen opening: compute `C' = energy_amount·G + blind·H`, verify `compress(C') == hex.defence_commitment`
- **Resolve combat:**
    - If attack.energy_committed > energy_amount: **Attacker wins**
        - Transfer hex ownership to attacker
        - Set hex.last_owner_change = now (activates 30-min occupation shield)
        - Set hex.last_combat_resolved = now
        - Surplus = attack.energy_committed - energy_amount → returned to attacker's energy_balance
        - Deduct energy_amount from defender's energy_committed (the revealed defence is lost)
        - Update both players' hex_count, landmark_count
        - Update both players' attack/defence stats
    - If attack.energy_committed ≤ energy_amount: **Defender wins**
        - Hex remains with defender
        - Set hex.last_combat_resolved = now (triggers 60-min combat cooldown)
        - Deduct energy_amount from defender's energy_committed (commitment consumed)
        - Attacker loses all committed energy (already deducted at launch)
        - Update both players' stats
- Set attack.resolved = true, set result
- Set hex.under_attack = false, hex.commitment_locked = false
- Clear hex.defence_commitment to zeroes, set has_commitment = false, set defence_nonce = 0 (defender must recommit)
- Close Attack account (reclaim rent to attacker)
- Recalculate points for both players (lazy update)
- If either player's recalculated score exceeds season.victory_threshold, emit `VictoryThresholdReached` event (actual season-ending state change deferred to `claim_victory`)
- Emit `AttackResolved` event

#### 3.3.13 `resolve_timeout`

**Purpose:** Resolve an attack where the defender did not reveal in time. Permissionless — anyone can call.

**Accounts:** any_signer (payer for compute), season (read), player_defender (mut), player_attacker (mut), hex (mut), attack (mut)

**Logic:**
- Verify attack is not already resolved
- Verify current time is past attack.deadline
- **Attacker wins by default**
    - Transfer hex ownership to attacker
    - Set hex.last_owner_change = now (activates 30-min occupation shield)
    - Set hex.last_combat_resolved = now
    - Energy returned to attacker = `max(0, energy_committed - season.min_attack_energy)` — attacker always loses at least `min_attack_energy` (default 10)
    - Defender's energy_committed is NOT reduced (they never revealed, so the program doesn't know the per-hex amount — it remains locked as phantom committed energy)
    - Add estimate to defender's `phantom_energy` field for UI display
    - Update both players' hex_count, landmark_count, stats
- Set attack.resolved = true, result = DefaultWin
- Set hex.under_attack = false, hex.commitment_locked = false
- Clear hex.defence_commitment to zeroes, set has_commitment = false, set defence_nonce = 0
- Close Attack account
- Recalculate points for both players
- If either player's recalculated score exceeds season.victory_threshold, emit `VictoryThresholdReached` event (actual season-ending state change deferred to `claim_victory`)
- Emit `AttackTimedOut` event

**Tiered timeout cost:**

| Attack energy | Energy lost | Energy returned | Cost as % |
|---|---|---|---|
| 10 (spam) | 10 | 0 | 100% |
| 30 (probe) | 10 | 20 | 33% |
| 80 (serious) | 10 | 70 | 12% |

Griefing with minimum attacks costs 100% every time. Legitimate conquest is barely penalised. `min_attack_energy` is a tunable anti-spam parameter per season.

**Note on phantom committed energy:** When a defender loses a hex by timeout, the energy they had committed to that hex remains locked in their `energy_committed` total. The `phantom_energy` field on the Player account tracks an estimate of this dead energy for UI display (showing `energy_committed - phantom_energy` as "active" committed). The permissionless `clear_phantom_energy` instruction can zero out `energy_committed` when a player has no remaining hex commitments.

**Partial recovery (soft fail):** Phantom energy is not permanently lost. After a 24-hour delay, a player can call `recover_phantom_energy` to reclaim 50% of the estimated phantom energy for a specific lost hex. This is a deliberate soft penalty — the player loses time (24h where energy is locked) and 50% of the committed amount, but retains the other half. This prevents the "feels like theft" experience that causes casual players to quit, while still meaningfully punishing inattentive defence. Recovery is limited to once per lost hex per season (tracked on-chain).

#### 3.3.14 `claim_victory`

**Purpose:** End a season via early victory. Permissionless.

**Accounts:** any_signer, season (mut), player (mut — the claimed winner)

**Parameters:** `season_id`, `player_pubkey`

**Logic:**
- Verify season has not ended
- Recalculate player's points (lazy update to current time)
- Verify player's points ≥ season.victory_threshold
- Set season.phase = Ended
- Set season.actual_end = now
- Set season.winner = player_pubkey
- Set season.winning_score = player.points
- Set season.finalization_complete = true (no crank needed for early victory)
- Emit `SeasonEnded` event

#### 3.3.15 `end_season`

**Purpose:** End a season that has reached its maximum duration. Permissionless.

**Accounts:** any_signer, season (mut)

**Logic:**
- Verify season has not already ended
- Verify current time is past season.season_end
- Set season.phase = Ended
- Set season.actual_end = now
- Set season.finalization_complete = false (crank needed)
- Set season.finalization_leader = None
- Emit `SeasonEnded` event

#### 3.3.16 `finalize_chunk`

**Purpose:** Process a batch of players to determine the season winner. Permissionless crank.

**Accounts:** any_signer, season (mut), season_counters (mut), plus remaining accounts: Player accounts (mut) to process

**Parameters:** `season_id`, `player_pubkeys: Vec<Pubkey>` (batch of players to process)

**Logic:**
- Verify season has ended and finalization_complete is false
- For each player in the batch:
    - Recalculate their points to season.actual_end
    - Set player.finalized = true
    - Increment season_counters.finalized_count
    - If player.points > season.finalization_leader_score:
        - Set season.finalization_leader = player.player
        - Set season.finalization_leader_score = player.points
- Emit `FinalizationProgress` event

#### 3.3.17 `finalize_complete`

**Purpose:** Mark finalization as complete and set the winner. Permissionless.

**Accounts:** any_signer, season (mut), season_counters (read)

**Logic:**
- Verify season has ended and finalization_complete is false
- Verify season_counters.finalized_count == season_counters.player_count
- Set season.winner = season.finalization_leader
- Set season.winning_score = season.finalization_leader_score
- Set season.finalization_complete = true
- Emit `SeasonFinalized` event with winner

#### 3.3.18 `update_reputation`

**Purpose:** Update a player's persistent reputation after a season ends.

**Accounts:** any_signer (payer), season (read), player (read), reputation (mut, init_if_needed)

**Logic:**
- Verify season has ended and finalization is complete
- Create Reputation account if first season (payer covers rent if needed)
- Update lifetime stats from Player account
- Update best_season_rank and best_season_score if applicable

**Note:** This is permissionless — no player signature required. The instruction only copies deterministic stats from a Player PDA into a Reputation PDA. The crank calls it for all players automatically during the cleanup phase.

#### 3.3.19 `close_season_hex`

**Purpose:** Close a Hex account after season ends, returning rent to the current owner. Permissionless — the crank calls this.

**Accounts:** any_signer, season (read), hex (mut, close), remaining accounts: recipient wallet (verified against hex.owner)

**Parameters:** `season_id`, `hex_id`

**Logic:**
- Verify season has ended and finalization is complete
- Verify recipient wallet matches hex.owner
- Close hex account
- Lamports returned to recipient wallet (the current owner at season end)
- Emit `HexAccountClosed` event

#### 3.3.20 `close_season_player`

**Purpose:** Close a Player account after season ends and reputation has been updated. Permissionless — the crank calls this.

**Accounts:** any_signer, season (read), player (mut, close), remaining accounts: recipient wallet (verified against player.player)

**Parameters:** `season_id`, `player_pubkey`

**Logic:**
- Verify season has ended and finalization is complete
- Verify player.finalized is true
- Verify recipient wallet matches player.player
- Close player account
- Lamports returned to recipient wallet (the player's wallet)
- Emit `PlayerAccountClosed` event

**Note:** The crank calls `update_reputation` (permissionless) for all players before closing their accounts. No player action required.

#### 3.3.21 `init_valid_hexes`

**Purpose:** Create the ValidHexSet account for a season. Admin only.

**Accounts:** admin (signer, payer), season (read), valid_hex_set (PDA, init), system_program

**Logic:**
- Verify caller is admin
- Verify season exists and map_finalized is false
- Create ValidHexSet account with season_id

#### 3.3.22 `append_hex_data`

**Purpose:** Write chunks of hex IDs to the ValidHexSet. Admin only. Called multiple times if data exceeds transaction size.

**Accounts:** admin (signer), season (read), valid_hex_set (mut)

**Parameters:** `hex_ids: Vec<u64>` (batch of sorted hex IDs to append)

**Logic:**
- Verify caller is admin
- Verify map_finalized is false
- Append hex_ids to valid_hex_set.hex_ids
- Update hex_count

#### 3.3.23 `init_adjacency`

**Purpose:** Create the AdjacencySet account(s) for a season. Admin only.

**Accounts:** admin (signer, payer), season (read), adjacency_set (PDA, init), system_program

**Logic:**
- Verify caller is admin
- Verify season exists and map_finalized is false
- Create AdjacencySet account with season_id

#### 3.3.24 `append_adjacency_data`

**Purpose:** Write chunks of adjacency edges to the AdjacencySet. Admin only.

**Accounts:** admin (signer), season (read), adjacency_set (mut)

**Parameters:** `edges: Vec<(u64, u64)>` (batch of sorted edge pairs to append)

**Logic:**
- Verify caller is admin
- Verify map_finalized is false
- Append edges to adjacency_set.edges
- Update edge_count

#### 3.3.25 `finalize_map_data`

**Purpose:** Lock map data and enable gameplay. Admin only.

**Accounts:** admin (signer), season (mut)

**Logic:**
- Verify caller is admin
- Verify map_finalized is false
- Verify ValidHexSet and AdjacencySet accounts exist and contain data
- Set season.map_finalized = true

#### 3.3.26 `clear_phantom_energy`

**Purpose:** Permissionless cleanup of dead committed energy for a player with no remaining hex commitments.

**Accounts:** any_signer, season (read), player (mut), remaining accounts: all Hex accounts owned by this player that have commitments

**Logic:**
- Verify season is active (not ended)
- Iterate remaining accounts — count hexes with `has_commitment == true` owned by this player
- If player has zero committed hexes remaining and `energy_committed > 0`: set `energy_committed = 0`, set `phantom_energy = 0`
- If player has some committed hexes: no change (partial cases cannot be resolved without revealing amounts)

#### 3.3.27 `recover_phantom_energy`

**Purpose:** Allow a player to reclaim a portion of phantom energy from a hex lost by timeout, after a 24-hour delay. Encourages continued play after a missed reveal rather than ragequitting.

**Accounts:** player_wallet (signer), season (read), player (mut), phantom_recovery (mut, close → rent to player)

**Parameters:** `season_id`, `hex_id`

**Logic:**
- Verify caller matches phantom_recovery.player
- Verify phantom_recovery.recovered is false
- Verify current time is at least 24 hours after phantom_recovery.lost_at (`now - lost_at >= 86400`)
- Calculate recovery amount: `phantom_recovery.energy_estimate / 2` (50% recovery)
- Add recovery amount to player.energy_balance (capped at energy_cap)
- Subtract recovery amount from player.energy_committed
- Subtract recovery amount from player.phantom_energy
- Set phantom_recovery.recovered = true
- Close PhantomRecovery account (rent returned to player)
- Emit `PhantomEnergyRecovered` event

**PhantomRecovery account:**

**PDA seed:** `["phantom_recovery", season_id.to_le_bytes(), player_pubkey, hex_id.to_le_bytes()]`

Created by `resolve_timeout` when a defender loses a hex with a commitment. One per (player, hex, season). Closed on recovery or at season end cleanup.

| Field | Type | Description |
|-------|------|-------------|
| `season_id` | `u64` | Season |
| `player` | `Pubkey` | Defender who lost the hex |
| `hex_id` | `u64` | Hex that was lost |
| `energy_estimate` | `u32` | Estimated energy committed (from phantom_energy calculation) |
| `lost_at` | `i64` | Timestamp of the timeout loss |
| `recovered` | `bool` | Whether recovery has been claimed |

**Size:** ~60 bytes

**Changes to `resolve_timeout` (3.3.13):** When a defender loses a hex with a commitment, create a PhantomRecovery account alongside the existing phantom_energy tracking. The `energy_estimate` is set to `player.energy_committed / player.hex_count_before_loss` (same estimate used for the phantom_energy field).

### 3.4 Phase Transitions

Phase transitions are timestamp-based. The Season account stores the boundary timestamps and every instruction computes the effective phase from these timestamps:

```
fn effective_phase(season: &Season, now: i64) -> Phase {
    if season.actual_end.is_some() { return Phase::Ended; }
    if now >= season.season_end { return Phase::Ended; }
    if now >= season.escalation_start { return Phase::Escalation; }
    if now >= season.war_start { return Phase::War; }
    Phase::LandRush
}
```

The stored `phase` field is updated opportunistically when any instruction runs and detects a phase change. This means the on-chain `phase` field may be stale between interactions, but the effective phase is always correct. The backend crank periodically calls a no-op instruction to update the stored phase during quiet periods.

When a phase change is detected, the program emits a `PhaseChanged` event for the backend indexer.

### 3.5 Events

All events are emitted via Anchor's `emit!` macro for the backend indexer to consume.

| Event | Key Fields |
|-------|------------|
| `SeasonCreated` | season_id, start_time, end_time, landmark_count |
| `MapFinalized` | season_id, hex_count, edge_count |
| `PlayerJoined` | season_id, player, joined_at, starting_energy |
| `BannerSet` | season_id, player, nft_mint |
| `ShieldSet` | season_id, player, shield_start_hour, effective_at |
| `HexClaimed` | season_id, hex_id, player, is_landmark |
| `DefencesCommitted` | season_id, player, hex_count, total_energy_delta |
| `DefenceWithdrawn` | season_id, player, hex_id, energy_amount |
| `DefenceRecommitted` | season_id, player, hex_id |
| `DefenceIncreased` | season_id, player, hex_id, delta |
| `AttackLaunched` | season_id, attack_id, attacker, defender, target_hex, energy, deadline |
| `AttackResolved` | season_id, attack_id, result, attacker, defender, hex_id |
| `AttackTimedOut` | season_id, attack_id, attacker, defender, hex_id |
| `VictoryThresholdReached` | season_id, player, score |
| `PhantomEnergyRecovered` | season_id, player, hex_id, energy_recovered |
| `SeasonEnded` | season_id, end_reason |
| `SeasonFinalized` | season_id, winner, winning_score |
| `PhaseChanged` | season_id, new_phase, timestamp |
| `FinalizationProgress` | season_id, players_processed, current_leader |
| `HexAccountClosed` | season_id, hex_id, rent_returned_to |
| `PlayerAccountClosed` | season_id, player, rent_returned_to |

---

### 3.6 Security Considerations

**Pedersen commitment security:** The Ristretto255 group provides ~128 bits of security. The hiding property is information-theoretic (unconditional) — no amount of compute can extract the defence amount from a commitment. The binding property is computational, relying on the hardness of the discrete log problem. The secondary generator H is derived via hash-to-curve with a fixed domain separator, ensuring no party knows `log_G(H)`.

**Double resolution prevention:** Every attack has a `resolved` bool. The `reveal_defence` and `resolve_timeout` instructions check this first.

**Commitment integrity:** Pedersen commitments are stored per-hex and can only be opened by the hex owner (who knows the blinding factor). Cross-hex or cross-player commitment reuse is not possible.

**Energy overflow:** All energy arithmetic uses checked operations. Energy cannot go negative (unsigned integers) — every deduction verifies sufficient balance first.

**Hex ownership atomicity:** Hex ownership transfer, energy updates, and stat updates all happen within a single instruction (transaction). No intermediate states are possible.

**On-chain map validation:** Valid hex IDs and adjacency edges are stored directly on-chain in ValidHexSet and AdjacencySet accounts. Binary search validation on every claim and attack. Map data is finalized at season creation and immutable for the season's lifetime. A malicious client cannot claim invalid hexes or attack non-adjacent hexes.

**One attack per hex:** Eliminates resolution-ordering exploits. A hex can only be in one combat at a time.

**Occupation shield and combat cooldown:** Prevents capture ping-pong (30 min after capture) and re-attack spam (60 min after successful defence).

**Timezone shield delay:** 24-hour delay on shield changes prevents tactical abuse.

**Rent reclamation:** Attack accounts are closed on resolution, returning rent to the attacker. Hex accounts are closed at season end, returning rent to the current owner (recipient wallet passed as remaining account and verified). Player accounts are closed at season end, returning rent to the player wallet. The Season account is retained permanently as a historical record. Reputation accounts are permanent.

**Phase enforcement:** Every instruction computes effective phase from timestamps. Attacks during Land Rush are rejected. Claims after season end are rejected.

**Pause mechanism:** GlobalConfig.paused flag halts all non-read instructions.

**Admin authority boundaries:** The admin can create seasons, set landmarks, upload map data, and create the initial configuration. The admin cannot: alter hex ownership, modify player energy, change combat outcomes, set the season winner (determined by on-chain finalization), redirect rent deposits, or access player funds.

**MEV considerations:** On Solana, transaction ordering within a block is determined by the leader. For Solvasion, MEV risk is minimal because: (a) attack resolution has a 6-hour window, so there's no time-critical front-running incentive; (b) one attack per hex eliminates resolution-ordering exploits; (c) defence reveals don't benefit from being reordered (the defender has until the deadline regardless). The only theoretical MEV vector is a validator preferentially ordering their own `resolve_timeout` calls to capture hexes, but this requires the validator to also be a player and to have launched the attack — a narrow and self-correcting scenario.

**Compute budget for Ristretto operations:** Pedersen commitment verification requires two Ristretto scalar multiplications plus a point addition (~30,000 CU). This is well within the default 200,000 CU budget. The `commit_defence` and `increase_defence` instructions do not verify commitments (they only store them), so they have no additional compute cost from the cryptographic scheme. **Contingency:** If curve25519 syscalls are not active on mainnet, pure BPF Ristretto operations cost ~6.8M CU (far beyond limits). In this case, fall back to SHA256 commitments with aggregate deltas. See Section 6.2 for the full contingency plan.

### 3.7 Error Codes

The program defines the following error enum for use across all instructions. The frontend maps these to user-facing messages.

| Error Code | Instruction(s) | Description |
|------------|----------------|-------------|
| `ProgramPaused` | All | GlobalConfig.paused is true |
| `SeasonEnded` | Most | Season phase is Ended |
| `MapNotFinalized` | `join_season`, `claim_hex`, `launch_attack` | `map_finalized` is false |
| `JoinCutoffPassed` | `join_season` | Current time past `join_cutoff` |
| `AlreadyJoined` | `join_season` | Player PDA already exists |
| `InsufficientEnergy` | `claim_hex`, `launch_attack`, `commit_defence`, `increase_defence` | `energy_balance` too low |
| `InvalidHex` | `claim_hex` | hex_id not found in ValidHexSet |
| `HexAlreadyOwned` | `claim_hex` | Hex PDA already exists |
| `NotAdjacent` | `claim_hex`, `launch_attack` | Edge not found in AdjacencySet |
| `EdgeNotInChunk` | `claim_hex`, `launch_attack` | Queried edge outside passed chunk's range |
| `RespawnLimitExceeded` | `claim_hex` | `respawn_count >= max_respawns_per_season` |
| `NotHexOwner` | `commit_defence`, `increase_defence`, `withdraw_defence`, `reveal_defence` | Caller doesn't own the hex |
| `CommitmentLocked` | `commit_defence`, `increase_defence`, `withdraw_defence`, `recommit_defence` | Hex under active attack |
| `CommitmentExists` | `commit_defence` | Hex already has a commitment |
| `NoCommitment` | `increase_defence`, `withdraw_defence`, `recommit_defence` | Hex has no commitment |
| `InvalidNonce` | `commit_defence`, `increase_defence`, `recommit_defence` | Nonce doesn't match expected `commitment_nonce` |
| `InvalidCommitmentOpening` | `reveal_defence`, `withdraw_defence`, `recommit_defence` | Pedersen verification failed |
| `AttackDuringLandRush` | `launch_attack` | Attacking not permitted in Land Rush |
| `HexUnderAttack` | `launch_attack` | Hex already has a pending attack |
| `OccupationShieldActive` | `launch_attack` | Hex within occupation shield window |
| `CombatCooldownActive` | `launch_attack` | Hex within combat cooldown window |
| `SelfAttack` | `launch_attack` | Attacker owns the target hex |
| `BelowMinAttackEnergy` | `launch_attack` | `energy_committed < min_attack_energy` |
| `AttackAlreadyResolved` | `reveal_defence`, `resolve_timeout` | Attack already resolved |
| `DeadlineNotPassed` | `resolve_timeout` | Current time before attack deadline |
| `DeadlinePassed` | `reveal_defence` | Current time past attack deadline |
| `NotDefender` | `reveal_defence` | Caller is not the defender |
| `SeasonNotEnded` | `finalize_chunk`, `finalize_complete`, `close_season_hex`, `close_season_player`, `update_reputation` | Season hasn't ended |
| `FinalizationComplete` | `finalize_chunk` | Finalization already done |
| `FinalizationIncomplete` | `finalize_complete`, `close_season_hex`, `close_season_player` | Not all players finalized |
| `PlayerNotFinalized` | `close_season_player` | Player hasn't been finalized |
| `InvalidRecipient` | `close_season_hex`, `close_season_player` | Recipient wallet doesn't match stored owner/player |
| `VictoryNotReached` | `claim_victory` | Player's points below victory threshold |
| `InvalidShieldHour` | `set_shield` | `shield_start_hour` not in 0–23 |
| `NftNotOwned` | `set_banner` | Wallet doesn't hold the specified NFT |
| `MapAlreadyFinalized` | `append_hex_data`, `append_adjacency_data` | `map_finalized` is already true |
| `RecoveryTooEarly` | `recover_phantom_energy` | Less than 24 hours since timeout loss |
| `RecoveryAlreadyClaimed` | `recover_phantom_energy` | Recovery already claimed for this hex |

---

## 4. Backend Service

### 4.1 Purpose

The backend is a read cache and convenience layer. It indexes on-chain state into a queryable database and provides APIs for the frontend. It has no authority over game outcomes.

The backend also runs a crank service that calls permissionless instructions (`resolve_timeout`, `end_season`, `finalize_chunk`, `close_season_hex`, `close_season_player`, `update_reputation`, `clear_phantom_energy`, phase transitions) on behalf of the network.

### 4.2 Technology

- **Runtime:** Node.js
- **Database:** SQLite (PostgreSQL for scale)
- **Hosting:** Self-hosted Linux (existing infrastructure)
- **Solana connection:** WebSocket subscription to program events + periodic RPC reconciliation

### 4.3 Core Functions

#### 4.3.1 Event Indexer

WebSocket subscription to the Solvasion program. Listens for all emitted events and updates the local database in real-time.

Events processed:
- `SeasonCreated` → insert season record
- `PlayerJoined` → insert player record
- `HexClaimed` → insert/update hex record
- `DefencesCommitted` → update player defence stats
- `DefenceIncreased` → update hex and player records
- `DefenceWithdrawn` → update hex and player records
- `AttackLaunched` → insert attack record
- `AttackResolved` / `AttackTimedOut` → update attack, hex, and player records
- `SeasonEnded` → update season phase
- `SeasonFinalized` → update season winner and standings
- `PhaseChanged` → update season phase
- `HexAccountClosed` / `PlayerAccountClosed` → update cleanup status

On WebSocket reconnection, the indexer runs a full reconciliation against on-chain state to catch any missed events.

#### 4.3.2 Reconciliation Crank

Runs every 2–3 minutes. Performs:

1. **State reconciliation:** For all active seasons, fetches key accounts from chain and compares with database. Updates any drift.

2. **Timeout resolution:** Queries for attacks past their deadline. Submits `resolve_timeout` transactions for each. The crank wallet needs a small SOL balance for transaction fees.

3. **Phase transitions:** Checks if any season should transition phases. Calls a lightweight instruction to update the stored phase and trigger events.

4. **Score updates:** Periodically recalculates player scores (lazy energy and points calculations) and updates the leaderboard in the database.

5. **Season finalization:** After a season ends by time expiry, the crank processes `finalize_chunk` calls in batches until all players are finalized, then calls `finalize_complete`.

6. **Reputation updates:** After finalization, the crank calls `update_reputation` for all players (permissionless — no player signature needed).

7. **Account cleanup:** After reputation updates, the crank iterates through all Hex accounts for the ended season and calls `close_season_hex` for each (with recipient wallet as remaining account). Then iterates through all Player accounts and calls `close_season_player` for each. Also closes SeasonCounters, ValidHexSet, and AdjacencySet accounts. This runs in batches and completes within minutes. Rent deposits are automatically returned to hex owners, player wallets, and admin. The Season account is NOT closed — it serves as a permanent record.

8. **Phantom energy cleanup:** During active seasons, the crank monitors for players who lose hexes by timeout and calls `clear_phantom_energy` when appropriate.

#### 4.3.3 Map Data Upload Service

At season creation time, the backend (or a standalone script) performs:

1. Generate all H3 hexes at the configured resolution within the geographic bounds
2. Classify each hex as land or water (using a geographic dataset or API)
3. Compute the adjacency edge set for all valid land hexes
4. Sort hex IDs and edge pairs for binary search
5. Upload hex data on-chain via `init_valid_hexes` + `append_hex_data` (chunked by transaction size)
6. Upload adjacency data via `init_adjacency` + `append_adjacency_data` (chunked)
7. Call `finalize_map_data` to lock the data and enable gameplay

#### 4.3.4 Bot Controller Service (v1)

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

**Implementation:** Bot controller as a separate Node.js module alongside the crank.

#### 4.3.5 Telegram Notification Service (v1)

**Approach:** Telegram bot that sends alerts to players who opt in.

**Player flow:**
1. Player starts a chat with the Solvasion Telegram bot
2. Bot generates a unique link code
3. Player enters the code in the Solvasion frontend while wallet is connected
4. Backend stores the mapping: wallet → Telegram chat ID
5. Player receives alerts

**Alerts (v1):**
- "Your hex [Paris] is under attack! You have 5h 42m to defend." (on `AttackLaunched` where player is defender)
- "You lost [Berlin] — defender timeout." (on `AttackTimedOut`)
- "You successfully defended [London]!" (on `AttackResolved`, defender wins)
- "Season 1 has entered the War Phase!" (on `PhaseChanged`)
- "[Player] is approaching victory! 45,000 / 50,000 points" (threshold alert)

**Implementation:** Node.js `node-telegram-bot-api` package. Backend monitors events and sends messages.

### 4.4 Database Schema

```sql
CREATE TABLE seasons (
    season_id           INTEGER PRIMARY KEY,
    season_pda          TEXT NOT NULL,
    phase               TEXT NOT NULL,
    created_at          INTEGER NOT NULL,
    land_rush_end       INTEGER NOT NULL,
    escalation_start    INTEGER NOT NULL,
    season_end          INTEGER NOT NULL,
    actual_end          INTEGER,
    player_count        INTEGER DEFAULT 0,
    total_hexes         INTEGER DEFAULT 0,
    winner              TEXT,
    winning_score       INTEGER,
    victory_threshold   INTEGER NOT NULL,
    cleanup_complete    BOOLEAN DEFAULT FALSE,
    config_json         TEXT NOT NULL
);

CREATE TABLE players (
    season_id           INTEGER NOT NULL,
    wallet              TEXT NOT NULL,
    player_pda          TEXT NOT NULL,
    energy_balance      INTEGER DEFAULT 0,
    energy_committed    INTEGER DEFAULT 0,
    hex_count           INTEGER DEFAULT 0,
    landmark_count      INTEGER DEFAULT 0,
    points              INTEGER DEFAULT 0,
    banner_nft          TEXT,
    banner_image_uri    TEXT,
    joined_at           INTEGER NOT NULL,
    shield_start_hour   INTEGER DEFAULT 22,
    attacks_launched    INTEGER DEFAULT 0,
    attacks_won         INTEGER DEFAULT 0,
    defences_made       INTEGER DEFAULT 0,
    defences_won        INTEGER DEFAULT 0,
    rent_returned       BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (season_id, wallet)
);

CREATE TABLE hexes (
    season_id           INTEGER NOT NULL,
    hex_id              INTEGER NOT NULL,
    hex_pda             TEXT NOT NULL,
    owner               TEXT,
    is_landmark         BOOLEAN DEFAULT FALSE,
    has_commitment      BOOLEAN DEFAULT FALSE,
    under_attack        BOOLEAN DEFAULT FALSE,
    claimed_at          INTEGER,
    last_owner_change   INTEGER,
    lat                 REAL,
    lng                 REAL,
    name                TEXT,
    rent_returned       BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (season_id, hex_id)
);

CREATE TABLE attacks (
    attack_id           INTEGER NOT NULL,
    season_id           INTEGER NOT NULL,
    attack_pda          TEXT NOT NULL,
    attacker            TEXT NOT NULL,
    defender            TEXT NOT NULL,
    target_hex          INTEGER NOT NULL,
    origin_hex          INTEGER NOT NULL,
    energy_committed    INTEGER NOT NULL,
    launched_at         INTEGER NOT NULL,
    deadline            INTEGER NOT NULL,
    resolved            BOOLEAN DEFAULT FALSE,
    result              TEXT,
    resolved_at         INTEGER,
    PRIMARY KEY (season_id, attack_id)
);

CREATE TABLE reputations (
    wallet              TEXT PRIMARY KEY,
    reputation_pda      TEXT NOT NULL,
    seasons_played      INTEGER DEFAULT 0,
    seasons_won         INTEGER DEFAULT 0,
    total_hexes_captured INTEGER DEFAULT 0,
    total_attacks       INTEGER DEFAULT 0,
    total_wins          INTEGER DEFAULT 0,
    total_defences      INTEGER DEFAULT 0,
    total_defence_wins  INTEGER DEFAULT 0,
    best_rank           INTEGER,
    best_score          INTEGER
);

CREATE TABLE notification_preferences (
    wallet              TEXT PRIMARY KEY,
    telegram_chat_id    TEXT,
    link_code           TEXT,
    linked_at           INTEGER,
    alerts_enabled      BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_hexes_owner ON hexes(season_id, owner);
CREATE INDEX idx_hexes_unowned ON hexes(season_id, owner) WHERE owner IS NULL;
CREATE INDEX idx_attacks_pending ON attacks(season_id, resolved, deadline) WHERE resolved = FALSE;
CREATE INDEX idx_players_points ON players(season_id, points DESC);
CREATE INDEX idx_attacks_defender ON attacks(season_id, defender, resolved);
CREATE INDEX idx_hexes_cleanup ON hexes(season_id, rent_returned) WHERE rent_returned = FALSE;
CREATE INDEX idx_players_cleanup ON players(season_id, rent_returned) WHERE rent_returned = FALSE;
```

### 4.5 REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/seasons` | GET | List all seasons (active and past) |
| `/api/seasons/:id` | GET | Season details including config and standings |
| `/api/seasons/:id/map` | GET | Full hex map state — all hexes with owners, landmarks, attack status |
| `/api/seasons/:id/leaderboard` | GET | Player rankings by points |
| `/api/seasons/:id/players` | GET | All players in a season |
| `/api/seasons/:id/players/:wallet` | GET | Player details, stats, hex list |
| `/api/seasons/:id/attacks` | GET | Active and recent attacks |
| `/api/seasons/:id/attacks/pending/:wallet` | GET | Attacks where this wallet needs to defend |
| `/api/seasons/:id/hex/:hexId` | GET | Hex details — owner, attack status, landmark |
| `/api/reputation/:wallet` | GET | Lifetime reputation stats |
| `/api/stats` | GET | Global stats across all seasons |

**Rate limiting:** All endpoints are rate-limited to 60 requests per minute per IP. The `/map` endpoint (which returns all ~500 hexes) is limited to 10 requests per minute per IP.

### 4.6 Resilience

The backend is a read cache only. If it crashes or produces incorrect data, no game state is affected. On restart, it reconciles from on-chain data.

The WebSocket connection may drop. The reconciliation crank (running every 2–3 minutes) catches any missed events.

The crank's timeout resolution, finalization, and account cleanup are conveniences, not requirements. Anyone can call the permissionless instructions directly.

## 5. Frontend

### 5.1 Technology

- **Framework:** React + TypeScript
- **Map rendering:** Mapbox GL JS or Leaflet with H3 hex overlay
- **H3 library:** h3-js (JavaScript bindings for H3)
- **Wallet:** @solana/wallet-adapter-react (Phantom, Solflare, Backpack)
- **Cryptography:** @noble/ed25519 or similar for Ristretto255 operations (client-side commitment generation)
- **Styling:** Tailwind CSS
- **Hosting:** Static site on Vercel, Netlify, or NUC

### 5.2 Views

#### 5.2.1 Landing / Season Select

- List of active and upcoming seasons
- Past season results and winners
- Global leaderboard (reputation)
- Connect wallet button
- Join season button
- Clear indication of costs: "You'll need ~0.05 SOL for network deposits. Most is returned when the season ends."

#### 5.2.2 Map View (Main Game Screen)

The primary interface. A full-screen interactive map of Europe with H3 hex overlay.

**Map features:**
- Zoom and pan across Europe
- Hexes coloured/textured by owner (NFT banner or fallback colour)
- Landmark hexes highlighted with a distinct border or icon
- Unowned hexes shown as neutral/grey
- Player's own territory highlighted with a glow or distinct border
- Hex hover tooltip: hex name (nearest city/region), owner, landmark status, under attack indicator, occupation shield countdown if active
- Share button for territory snapshots ("I captured Paris!")

**NFT rendering:**
- Contiguous territory < 10 hexes: NFT image tiled per hex (mosaic)
- Contiguous territory ≥ 10 hexes: NFT image stretched across blob
- Smooth transition as territory grows/shrinks past threshold
- Fallback to wallet-derived colour if no banner set

**Sidebar / panel:**
- Player stats: energy balance, energy committed, hex count, points
- Energy income rate (hexes × rate, with escalation indicator)
- Season info: phase, time remaining, victory threshold, current leader
- Leaderboard (top 10 by points)
- Active attacks (incoming and outgoing) with countdowns
- Alert: "Your hex [Paris] is under attack! 4h 32m to defend"
- Timezone shield status: prominent banner — "Shield Active (until 04:00 UTC)" in green, or "Shield Off (resumes at 22:00 UTC)" in grey. Clicking opens shield configuration.

#### 5.2.3 Hex Action Panel

Clicking a hex opens an action panel:

**Unowned hex (adjacent to your territory):**
- "Claim this hex" button
- Cost display (10 energy, adjusted for escalation)
- Hex name and coordinates

**Your hex:**
- Current defence status (committed / uncommitted / locked)
- Defence management: commit, increase, withdraw, or recommit
- "Reinforce" button for quick `increase_defence` (enter additional energy amount). Subtitle: "Opponents will see you reinforced this hex."
- Hex stats (claimed date, times defended)
- Occupation shield indicator if recently captured

**Enemy hex (adjacent to your territory):**
- Owner info (wallet, banner NFT, player stats)
- "Launch attack" button (disabled if hex under attack or in occupation shield or combat cooldown)
- Energy slider (choose attack energy, minimum 10)
- Warning if energy is low
- Shield indicator: if defender's shield is currently active, show "Defender's shield is active — they will have 12 hours to respond instead of 6." If inactive, show "Defender has 6 hours to respond."
- Cooldown indicator: if hex is in combat cooldown, show remaining time and reason ("Successfully defended — cooldown expires in 42min")

**Enemy hex (not adjacent):**
- Owner info (view only)
- "Not adjacent — expand your territory to reach this hex"

#### 5.2.4 Defence Allocation UI

A dedicated interface for managing hidden defences.

- Shows all owned hexes on a mini-map, colour-coded by defence status (committed, uncommitted, locked)
- Slider or input for each hex to allocate defence energy
- "Reinforce" quick action for each committed hex (uses `increase_defence` — no reveal). UI tooltip: "Reinforcing is visible to opponents — they'll see how much you added, but not your total."
- Total committed energy display
- Remaining available energy display
- Warning for hexes left undefended
- "Commit defences" button (generates Pedersen commitments client-side, submits transactions — batched if needed)
- Clear indication of which hexes are locked (under active attack)

**Secret management:**
- Season secret seed derived from one wallet signature on first use
- Seed stored in browser localStorage
- Blinding factors derived deterministically from seed + hex_id + nonce (stored on-chain)
- Regeneration instructions: "Connect your wallet and click 'Regenerate Seed' to recover on a new device"
- Export/import seed backup option
- Prominent warning about not clearing browser data without backing up

**Local state tracking:** The client maintains a local record of per-hex defence amounts for UX purposes (showing current allocation, calculating reinforcements). This local state can be regenerated from on-chain data (nonces) and the wallet seed, but persisting it locally avoids unnecessary recomputation.

#### 5.2.5 Attack Dashboard

- List of all outgoing attacks with countdowns
- List of all incoming attacks with countdowns and "Reveal Defence" button
- Attack history (resolved attacks with outcomes)
- Attack resolution animation

##### 5.2.5.1 Attack Countdown and Auto-Reveal Support

When a player's hex is under attack, the UI surfaces the countdown prominently to prevent surprise timeouts:

**Countdown badge:** Every attacked hex shows a countdown badge on the map (e.g. "Reveal in 04:32:10") with colour progression: green (>3h remaining) → yellow (1–3h) → red (<1h) → flashing red (<15min).

**Attack alert banner:** A persistent banner at the top of the screen: "Your hex [Paris] is under attack! 4h 32m to defend. [Reveal Now]". The banner links directly to a prefilled reveal screen.

**One-tap reveal screen:** Clicking the banner or the "Reveal Defence" button opens a prefilled screen showing:
- The attacked hex name and location
- The attacker's committed energy (publicly visible)
- The player's committed defence amount (from the defence ledger)
- A single "Reveal and Defend" button that signs and submits the transaction
- No manual data entry required when the defence ledger has the amount

**Auto-reveal reminder toggle:** In settings, an "Enable Attack Reminders" toggle (default: on) schedules:
- Telegram notification immediately when attack is launched (if linked)
- Follow-up notification at 50% countdown (e.g. 3h mark for a 6h window)
- Urgent notification at 1h remaining
- Final warning at 15min remaining

**Phantom recovery prompt:** After a timeout loss, the UI shows: "You missed the defence window for [hex]. You lost the hex, but you can recover 50% of your committed energy in 24 hours. [Set Reminder]"

#### 5.2.6 Leaderboard

- Sortable by points, hex count, landmarks held
- Player banners displayed next to names
- Season progress bar showing leader vs victory threshold
- Historical season results

#### 5.2.7 Profile / Reputation

- Wallet address and banner NFT
- Current season stats
- Timezone shield configuration
- Lifetime reputation (cross-season)
- Season history (past results)
- Post-season: "Season ended — 0.042 SOL returned" confirmation

### 5.3 Transaction Flow

All game actions require wallet signature. The frontend handles:

1. Referencing on-chain ValidHexSet and AdjacencySet accounts (for claims and attacks)
2. Building the transaction with correct accounts and parameters
3. Prompting wallet signature
4. Submitting to Solana
5. Waiting for confirmation
6. Optimistic UI update (show expected result immediately, reconcile with backend)

For defence commitments:
1. Derive season secret seed (sign once, cache locally)
2. For each hex: choose amount, derive blinding factor from `(seed, hex_id, nonce)`, compute Pedersen commitment `C = a·G + r·H`
3. Submit commitment points on-chain via `commit_defence` or `increase_defence`
4. When revealing (for defence or withdrawal): regenerate blinding factor from seed and nonce, submit `(amount, blind)` to open the commitment

**Error handling:** The frontend displays clear error states for common failures: insufficient energy, hex already under attack, adjacency requirement not met, transaction timeout, wallet disconnection. On transaction failure, the UI reverts optimistic updates and shows the error with a retry option.

### 5.4 Spectator Mode (v1 stretch)

Unauthenticated users (no wallet connected) can view:
- The map with all hex ownership and colours
- The leaderboard
- Active attacks (publicly visible)
- Season information and progress

They cannot perform any actions. This allows sharing links to the game state and builds audience before a player commits to joining.

### 5.5 Client Defence State Management

The on-chain program never sees per-hex defence amounts — only Pedersen commitments. The client is solely responsible for tracking per-hex allocations. Loss of this local state degrades functionality (cannot use `increase_defence`) but does not lock the player out entirely (`withdraw_defence` can still recover energy via the blinding factor alone, derived from the seed and on-chain nonce).

#### 5.5.1 Defence Ledger

The client maintains a **defence ledger** — a local mapping of `hex_id → energy_amount` for all hexes with active commitments. This is stored in browser localStorage alongside the season secret seed.

The ledger is updated on every defence operation:
- `commit_defence`: write `(hex_id, amount)` for each committed hex
- `increase_defence`: update `hex_id` entry to `old_amount + delta`
- `withdraw_defence` / `recommit_defence`: clear or update entry
- Combat resolution (hex lost or defence revealed): clear entry

#### 5.5.2 Seed and Ledger Persistence

On first use, the client prompts a wallet signature to derive the season secret seed (Section 2.5.2). The seed and defence ledger are stored in two places:

1. **Local cache (fast):** localStorage under a key namespaced by `(wallet_address, season_id)`. Primary read source for all operations.
2. **Cloud backup (resilient, optional):** An encrypted JSON blob stored in wallet-linked cloud storage (e.g. a signed, encrypted payload pushed to a simple backend endpoint or IPFS). The blob is encrypted with a key derived from the season seed itself, so the server never sees plaintext. Updated automatically on every defence operation (debounced to avoid excessive writes).

**Backup prompt:** After initial seed derivation, the client displays a persistent banner: "Back up your defence data to avoid losing access on other devices." The banner includes:
- A "Copy Seed" button (copies the hex-encoded seed to clipboard)
- A "Download Backup" button (exports seed + current defence ledger as an encrypted JSON file, encrypted with a user-provided passphrase)
- An "Enable Cloud Sync" toggle (stores encrypted defence ledger remotely, auto-synced)
- A dismissal action that sets a `seed_backup_acknowledged` flag

The banner reappears if `seed_backup_acknowledged` is false at session start.

**Export / Import in settings:** The settings panel includes "Export Defence Data" and "Import Defence Data" buttons for manual backup management. Export produces an encrypted JSON file; Import accepts one and restores the defence ledger.

#### 5.5.3 Device Recovery

When a player connects their wallet on a new device (or after clearing browser data):

1. The client detects no stored seed for this wallet + season
2. It prompts: "Re-derive your defence key?" and requests a wallet signature (same message as original derivation — produces the same seed)
3. The seed is re-derived and stored locally
4. **Cloud recovery check:** If cloud sync was enabled, the client attempts to fetch and decrypt the remote defence ledger using the re-derived seed. If successful, the full defence ledger is restored — **no degraded mode, full functionality immediately.**
5. **Fallback (no cloud backup):** The client fetches all Hex accounts owned by the player from the backend. For each hex with `has_commitment == true`, the client reads the on-chain `defence_nonce` and re-derives the blinding factor: `r = HashToScalar(SHA256(seed || "defence_r" || season_id || hex_id || defence_nonce))`. Blinding factors are available for `reveal_defence` and `withdraw_defence`.

**Energy amounts are NOT recoverable from the seed alone** (without cloud backup). In this fallback case, the client marks all committed hexes as "amount unknown" in the defence ledger. See Section 5.5.4 for degraded mode behaviour.

**Recovery mode wizard:** The settings panel includes a "Recover Defence Data" wizard that walks the player through: (1) re-deriving the seed via wallet signature, (2) checking cloud backup, (3) importing from a local backup file, or (4) entering degraded mode with guidance on how to restore amounts manually.

#### 5.5.4 Degraded Mode (Amount Unknown)

When the defence ledger lacks the energy amount for a committed hex, the UI operates in degraded mode for that hex:

- **`increase_defence`:** Disabled. The UI shows: "Amount unknown — reinforce not available. Withdraw and recommit to regain full control."
- **`withdraw_defence`:** Available. The player must manually enter the energy amount they believe is committed. If incorrect, the Pedersen verification will fail on-chain and the transaction will be rejected. The UI explains: "Enter the defence amount you originally committed. The transaction will fail if incorrect."
- **`reveal_defence` (under attack):** Same as withdraw — player must enter the amount. The UI shows a prominent warning and the remaining countdown.
- **`recommit_defence`:** Available, but requires manual entry of the old amount (same as withdraw).

**Import from backup:** The client provides a "Restore from Backup" option that accepts the encrypted JSON file from Section 5.5.2, restoring both seed and defence ledger.

---

## 6. Technical Considerations

### 6.1 On-Chain Map Data

The valid hex set and adjacency edges are stored directly on-chain, eliminating the need for Merkle proofs and off-chain proof services.

**ValidHexSet:** Sorted array of H3 indices stored in a PDA. At ~500 hexes × 8 bytes = ~4KB, fits in a single account. Validation via binary search: O(log n) comparisons per lookup.

**AdjacencySet:** Sorted array of `(hex_a, hex_b)` edge pairs stored across 1–3 PDA chunks. At ~2,000 edges × 16 bytes = ~32KB. Validation via binary search.

**Upload process:** Admin uploads data in chunks during season setup (limited by transaction size), then finalizes with `finalize_map_data`. No game instructions work until map is finalized.

**Immutability invariant:** After `finalize_map_data` sets `map_finalized = true`, the ValidHexSet and AdjacencySet accounts are treated as immutable for the remainder of the season. The program rejects all calls to `append_hex_data` and `append_adjacency_data` when `map_finalized` is true. There is no mechanism to un-finalize map data. If map data is incorrect, the season must be abandoned and a new season created.

**Rent:** ~0.25 SOL total for map data accounts, automatically refunded at season end when closed by the crank.

**Transaction size impact:** Claims and attacks no longer carry Merkle proofs (~300–350 bytes each), freeing significant transaction space. Instead they reference the on-chain ValidHexSet/AdjacencySet accounts.

### 6.2 Pedersen Commitment Implementation

**Ristretto255 operations:** The program uses compressed Ristretto255 points (32 bytes each). On-chain verification requires:
1. Decompress the stored commitment point
2. Compute `a·G + r·H` (two scalar multiplications + one point addition)
3. Compress the result and compare bytes

**Generator H:** Derived once via `HashToRistretto("Solvasion:DefenceCommitment:H:v1")` using a stable hash-to-ristretto method. The resulting compressed point bytes are hardcoded in the program as a constant.

**Scalar encoding:** Blinding factors `r` are 32-byte canonical scalars (reduced mod the Ristretto group order `l`). The `HashToScalar` function hashes the input and reduces the result modulo `l`.

**Compute cost:** Each Pedersen verification costs approximately 30,000 CU (two scalar multiplications at ~12,000 CU each, plus point addition and compression). This is well within the default 200,000 CU budget and well within Solana's compute limits.

**Client library:** The frontend uses a JavaScript Ristretto255 library (e.g. `@noble/curves` or similar) for commitment generation. All cryptographic operations (seed derivation, blinding factor derivation, commitment computation) happen client-side.

**Contingency plan:** Pedersen commitments are the target for v1, but depend on Ristretto255 syscall availability on Solana mainnet.

**Phase 1, Day 1:** Write a micro-program that performs Pedersen verification (decompress stored commitment, compute `a·G + r·H`, compress and compare). Deploy to devnet. Measure actual CU cost.

**If curve25519 syscalls are active:** Proceed as specified. Expected cost ~30k CU via syscall.

**If syscalls are NOT active (pure BPF):** Scalar multiplication costs ~3.4M CU per the Solana Labs benchmarks. Two multiplications = ~6.8M CU — far beyond the 1.4M CU max compute budget. In this case:

- **Option A:** Investigate CPI to the ZK ElGamal Proof Program (if re-enabled after audit) for Pedersen verification via a native program
- **Option B:** Use a pre-verification pattern: client submits the opening `(a, r)` and the program recomputes the commitment using a cheaper construction (potentially leveraging Ed25519 signature verification syscall creatively)
- **Option C:** Fall back to SHA256 with the v1.1 `total_energy_delta` design. Ship the game. Upgrade to Pedersen when syscalls are confirmed live.

**The game ships regardless.** The commitment scheme is the hiding mechanism, not the game mechanic. SHA256 with aggregate deltas still provides meaningful strategic depth.

#### 6.2.1 SHA256 Mode — Gameplay Property Changes

If the Day 1 CU benchmark determines that Ristretto255 operations are not feasible within compute limits (Section 6.2, Option C), the commitment scheme falls back to SHA256. This changes the following gameplay properties:

**Commitment construction (SHA256):**
```
commitment = SHA256(amount || salt)
```
Where `salt` is derived identically to the Pedersen blinding factor: `salt = SHA256(seed || "defence_r" || season_id || hex_id || nonce)`. Stored as `[u8; 32]` on the Hex account (same field, same size).

**What changes:**

- **`increase_defence` is removed.** SHA256 commitments are not additively homomorphic. To reinforce a hex, the player must use `recommit_defence` (withdraw old commitment + submit new), which reveals the old allocation. There is no way to add energy without revealing the existing amount.

- **`commit_defence` reveals per-hex amounts to transaction observers.** Without Pedersen hiding, the program needs to verify that committed amounts are consistent with `total_energy_delta`. Two options:
  - **(a) Aggregate delta only (weaker hiding):** The client submits commitments and a `total_energy_delta`. Per-hex amounts are not submitted in plaintext, but an observer who indexes multiple commits over time can infer per-hex allocations from the pattern of deltas and hex changes. This is the v1.1 design — practically obscure but not cryptographically hidden.
  - **(b) Per-hex amounts in plaintext (no hiding at commit time):** The program verifies each amount matches the commitment at commit time. Defence amounts are hidden only between commits — once committed, only the commitment hash is on-chain, but the original transaction reveals the amount to anyone watching.

  **Recommended for SHA256 mode:** Option (a), aggregate delta. It preserves meaningful strategic ambiguity even if it doesn't provide information-theoretic hiding.

- **Information leakage profile:** Under SHA256 with aggregate deltas, a sophisticated observer indexing all transactions can build probabilistic models of per-hex allocations (especially after seeing multiple commit/recommit cycles). Casual players checking the explorer will not easily determine allocations. This is a significant downgrade from Pedersen but still provides useful strategic depth.

- **Account structure changes:** None. The `defence_commitment` field on Hex remains `[u8; 32]` (SHA256 hash instead of compressed Ristretto point). The `defence_nonce` field is used identically. The Player account is unchanged.

- **Compute cost:** SHA256 verification costs ~5,000 CU (vs ~30,000 CU for Pedersen). Well within limits.

**The core game loop is unchanged.** Claim, commit, attack, reveal — all work the same way. The strategic texture is reduced (observers gain more information over time) but the fog-of-bluff remains functional for the majority of players.

### 6.3 H3 Map Generation

At season creation, a script generates the map data:

1. Enumerate all H3 hexes at resolution 4 within the geographic bounding box
2. For each hex, determine its centre coordinates
3. Classify as land or water using a geographic dataset (Natural Earth coastline data or similar)
4. For all land hexes, compute H3 neighbours and filter to those also in the land set
5. Assign landmark status to hexes containing major cities (geocode city coordinates → H3 index)
6. Sort hex IDs and edge pairs for binary search
7. Output JSON files with valid hexes, adjacency edges, and landmark assignments for upload to chain

This is a one-time computation per season configuration, taking seconds to run.

### 6.4 Account Space and Rent

| Account | Size | Rent (SOL) | Count per Season | Total Rent | Lifecycle |
|---------|------|------------|------------------|------------|-----------|
| Season | ~600 bytes | ~0.005 | 1 | 0.005 | Permanent record |
| SeasonCounters | ~20 bytes | ~0.001 | 1 | 0.001 | Closed at season end → rent to admin |
| ValidHexSet | ~4,000 bytes | ~0.03 | 1 | 0.03 | Closed at season end → rent to admin |
| AdjacencySet | ~32,000 bytes | ~0.22 | 1–3 chunks | 0.22 | Closed at season end → rent to admin |
| Player | ~195 bytes | ~0.002 | Up to 200 | 0.4 | Closed at season end → rent to player |
| Hex | ~136 bytes | ~0.002 | Up to 500 | 1.0 | Closed at season end → rent to owner |
| Attack | 160 bytes | ~0.002 | Transient | Reclaimed | Closed on resolution → rent to attacker |
| PhantomRecovery | ~60 bytes | ~0.001 | Transient | Reclaimed | Created on timeout loss → closed on recovery or season end |
| Reputation | 120 bytes | ~0.002 | Up to 200 | 0.4 | Permanent |

Total rent per season: approximately 2.1 SOL for a 200-player season (including ~0.25 SOL for map data). Attack accounts are created and closed (rent reclaimed) per attack. Hex, Player, SeasonCounters, ValidHexSet, and AdjacencySet accounts are automatically closed by the crank at season end, returning rent to owners, players, and admin respectively. The Season account is retained permanently (~0.005 SOL).

### 6.5 Player Cost Model

Solvasion is free to play. Players pay only Solana network costs:

**Rent deposits (refundable):** Creating Player, Hex, and Attack accounts requires rent deposits. These are automatically returned when accounts close — Attack accounts on combat resolution, Hex and Player accounts at season end via the crank.

**Transaction fees (non-refundable):** Base fee of 0.000005 SOL per transaction, plus optional priority fees. Even heavy players spend under $1 total in transaction fees across a full season.

**Permanent cost:** The Reputation account (~0.002 SOL, once per wallet lifetime) is the only non-refundable rent cost.

**Typical player cost:**

| Profile | Upfront SOL | Refunded SOL | Net Cost (SOL) | Net Cost (USD at ~$84/SOL) |
|---------|-------------|--------------|----------------|---------------------------|
| Tourist (8 hexes, 2 attacks) | ~0.02 | ~0.018 | ~0.003 | ~$0.25 |
| Casual (20 hexes, 10 attacks) | ~0.05 | ~0.04 | ~0.006 | ~$0.50 |
| Active (40 hexes, 30 attacks) | ~0.10 | ~0.09 | ~0.011 | ~$0.92 |
| Warlord (80 hexes, 60 attacks) | ~0.20 | ~0.18 | ~0.019 | ~$1.60 |

### 6.6 Transaction Size Limits

Solana transactions are limited to 1,232 bytes. The most space-constrained transactions are:

- **`commit_defence` with many hexes:** Each commitment is 8 bytes (hex_id) + 32 bytes (compressed point) + 8 bytes (nonce) = 48 bytes. With transaction overhead (~200 bytes for accounts), approximately 21 commitments fit in one transaction. Players with 50+ hexes would need 2–3 transactions.
- **`claim_hex`:** accounts (~250 bytes including ValidHexSet and AdjacencySet references) + parameters (~30 bytes). Fits easily in one transaction. No Merkle proofs needed.
- **`launch_attack`:** accounts (~300 bytes including AdjacencySet reference) + parameters (~30 bytes). Fits easily in one transaction.
- **`increase_defence`:** Single hex, minimal data (32 bytes commitment + 8 bytes nonce + 4 bytes delta + accounts). Easily fits.

For `commit_defence`, the frontend automatically batches into multiple transactions if needed, submitting them sequentially. The program handles each batch independently.

### 6.7 Compute Budget

Most instructions involve straightforward account reads and writes. The most compute-intensive operations are:

- **Binary search validation:** ValidHexSet (~500 entries) requires ~9 comparisons. AdjacencySet (~2,000 entries) requires ~11 comparisons. Negligible CU cost.
- **Pedersen commitment verification:** Two Ristretto scalar multiplications + point addition (~30,000 CU via syscall). Only performed in `reveal_defence`, `withdraw_defence`, and `recommit_defence`. Well within default limits. (If syscalls unavailable, falls back to SHA256 — see Section 6.2.)
- **`commit_defence` with many hexes:** Iterates through hex accounts, stores commitments. No Pedersen verification needed (commitments are stored, not verified). With 21 hexes per batch, well within limits.

For safety, request increased compute budget (400,000 CU) on `reveal_defence` and other verification instructions.

### 6.8 Scalability Limits

At 200 players and 500 hexes, the game is well within Solana's capabilities. Potential bottlenecks:

- **Hot accounts:** All mutable counters (player_count, total_hexes_claimed, next_attack_id) have been moved to the SeasonCounters PDA. The Season account is effectively read-only after creation, eliminating write contention.
- **Large commit_defence batches:** Handled by splitting across transactions (see 6.6).
- **Finalization crank:** Processing 200 players in batches of 10–20 requires 10–20 transactions. At Solana speeds, this completes in under a minute.
- **Account cleanup crank:** Closing ~700 accounts (500 hexes + 200 players) in batches of 10–20 requires 35–70 transactions. Completes in a few minutes.

---

## 7. Build Plan

### Phase 1: Map Data + Crypto Validation (Weeks 1–2)

- Build H3 map generation script (land classification, adjacency, landmarks)
- Output sorted hex IDs and adjacency edges for on-chain upload
- Test with resolution 4 for Europe (validate hex count, coastline accuracy, adjacency correctness)
- Set up Anchor development environment
- Derive and hardcode Ristretto255 generator H
- **Day 1 priority:** Write micro-program for Pedersen verification, deploy to devnet, measure actual CU cost
- Determine Pedersen vs SHA256 path based on CU benchmark results

### Phase 2: On-Chain Program — Core (Weeks 3–5)

**Week 3:**
- Implement account structures (GlobalConfig, Season, SeasonCounters, Player, Hex, Attack, Reputation, ValidHexSet, AdjacencySet)
- Implement `initialize` and `create_season`
- Implement map data upload instructions (`init_valid_hexes`, `append_hex_data`, `init_adjacency`, `append_adjacency_data`, `finalize_map_data`)
- Implement `join_season` and `set_banner`
- Implement `claim_hex` with binary search validation (valid hex + adjacency)
- Write unit tests for account creation, binary search validation, and adjacency

**Weeks 4–5:**
- Implement Pedersen commitment verification helper (Ristretto255 scalar mul + point add) or SHA256 fallback
- Implement `commit_defence` with commitment storage and energy accounting
- Implement `increase_defence` (add-only, no reveal)
- Implement `withdraw_defence` and `recommit_defence` with commitment opening verification
- Implement `launch_attack` with binary search adjacency, one-per-hex enforcement, shield deadline, and combat cooldown check
- Implement `reveal_defence` with commitment opening verification and combat resolution (fixed defender-wins accounting)
- Implement `resolve_timeout` with tiered energy refund and phantom energy tracking
- Implement `clear_phantom_energy`
- Write combat resolution tests (attacker wins, defender wins, timeout, occupation shield, combat cooldown)
- Write commitment tests (valid opening, invalid opening, increase, withdraw)

### Phase 3: Season Lifecycle (Weeks 6–7)

- Implement `set_shield` with 24-hour delay
- Implement phase transition logic (timestamp-based effective phase)
- Implement escalation multipliers
- Implement `claim_victory` and `end_season`
- Implement `finalize_chunk` and `finalize_complete`
- Implement `update_reputation` (permissionless)
- Implement `close_season_hex` and `close_season_player` (with recipient wallet verification)
- Implement respawn logic in `claim_hex`
- Write comprehensive integration tests including full season lifecycle with account cleanup
- Deploy to devnet

### Phase 4: Backend + Bots (Weeks 8–10)

- Set up Node.js project with @solana/web3.js
- Implement WebSocket event indexer
- Set up SQLite database with schema (including notification_preferences table)
- Implement reconciliation crank (state sync, timeout resolution, phase transitions, finalization, account cleanup, reputation updates, phantom energy cleanup)
- Implement REST API endpoints
- Implement rate limiting
- Implement bot controller service (personality archetypes, auto-scaling, Pedersen commitments)
- Implement Telegram notification bot (node-telegram-bot-api, wallet linking, attack/defence/phase alerts)
- Deploy on NUC, connect to devnet
- End-to-end test: create season → upload map → join → claim → attack → resolve → end → finalize → cleanup → verify rent returned

### Phase 5: Frontend MVP (Weeks 11–14)

**Weeks 11–12:**
- React project setup with wallet adapter
- Map rendering with Mapbox/Leaflet + H3 overlay
- Season list and join flow (with clear cost messaging)
- Basic hex display with ownership colours (wallet-derived colours)
- Hex claiming flow
- Defence allocation UI with commitment generation (Ristretto255 or SHA256 client library)
- `increase_defence` flow ("Reinforce" button, no-reveal top-up)
- Attack flow with energy selection
- Defence reveal flow (opening commitments)
- Attack dashboard with countdowns

**Weeks 13–14:**
- Timezone shield configuration
- NFT banner selection and hex rendering (mosaic + stretched)
- Leaderboard and player profiles
- Season progress and victory tracking
- Post-season UI (rent returned confirmation, phantom energy display)
- Spectator mode (unauthenticated viewing)
- Telegram linking UI
- Share cards ("I captured Paris!")
- Polish: animations, error handling, responsive design

### Phase 6: Testing + Launch (Weeks 15–16)

- Full end-to-end testing on devnet with multiple wallets and bot players
- Security review of on-chain program (commitment verification, energy accounting, combat resolution, account cleanup, combat cooldowns)
- Verify rent returns correctly to all players and hex owners at season end
- Stress testing (rapid attacks, many simultaneous players, large defence batches, bot behaviour)
- Bug fixes and UX refinements
- Deploy to mainnet
- Create Season 1
- Announce and recruit initial players

### Phase 7: Post-Launch (Ongoing)

- Monitor Season 1, gather feedback
- Verify account cleanup and rent returns work correctly at scale
- Tune bot behaviour based on player feedback
- Winner NFT minting (v2)
- Season 2 with balance adjustments based on Season 1 data
- Multi-step escalation (v2, if single-step proves too blunt)
- Optional commit epochs for reduced behavioural inference (v2)
- Mobile PWA (v2)
- Multiple map regions (v2)

---

## 8. Anti-Sybil Considerations

With free-to-play and no on-chain identity verification, sybil attacks (one person running multiple wallets) are a concern.

**Natural mitigations:**

- **Active defence requirement:** Each wallet's hexes must be independently defended within countdown windows. Running 5 accounts means monitoring and responding to attacks across 5 separate wallets with 5 separate secret seeds. This is genuinely burdensome.
- **Energy cap:** Each wallet caps at 500 energy. Multiple wallets don't compound beyond their individual caps.
- **No formal alliances:** Sybil wallets can't pool resources through any in-game mechanism.
- **Reputation transparency:** Player stats are public. Wallets that appear to coordinate suspiciously can be socially identified.
- **Timezone shield visibility:** Each player's shield window is public, making coordinated sybil behaviour more detectable.

**Additional mitigations (future):**

- Require a minimum SOL balance to join (proof of wallet activity, not an entry fee)
- Social verification (link wallet to Twitter/Discord)
- ZK proof of personhood (Reclaim Protocol or similar)
- Rate limiting joins per IP (backend level)

---

## 9. Legal Considerations

Solvasion in its free-to-play form has no gambling or financial risk concerns:

- **No money in:** Free to join, no entry fees, no staking. Players pay only Solana network costs (rent deposits returned at season end, negligible transaction fees)
- **No money out:** No prize pool, no token rewards, no play-to-earn
- **Not gambling:** No financial stake regardless of outcome
- **NFTs:** Players use existing NFTs as cosmetic banners only. The game does not mint, sell, or create financial value around NFTs
- **Rent handling:** All rent deposits are returned to the depositing players/hex owners at season end. No rent is retained by the platform or redirected to any treasury

Future paid seasons with entry fees and prize pools would need legal review, particularly regarding UK gambling law, smart contract prize distribution licensing, and tax implications. These concerns are deferred to v2.

---

## 10. Open Questions and Future Features

### 10.1 Open Questions

- **H3 resolution tuning:** Resolution 4 (~350 hexes for Europe) may be too coarse or too fine depending on player count. Test on devnet with simulated players. Resolution 5 (~2,500 hexes) could work for larger player counts.
- **Water hex edge cases:** Some hexes near coastlines may have their centre on land but be mostly water (or vice versa). May need manual curation of edge cases for each resolution.
- **Phantom committed energy cleanup:** Resolved — `clear_phantom_energy` instruction handles the zero-commitment case, and `phantom_energy` tracking field provides UI visibility for partial cases.
- **Victory threshold tuning:** 50,000 points with ~350 hexes and max 32 landmarks needs careful modelling. The threshold should be achievable but require genuine dominance.
- **Season naming:** Should seasons have human-readable names ("The Great European War") for narrative and marketing purposes?
- **Commit epochs (v2):** Optional time-windowed commitment periods to reduce behavioural inference from commit timing. Not required for cryptographic secrecy (Pedersen commitments handle that) but could reduce tactical information from observing when commits happen.
- **Reputation update window:** Now that `update_reputation` is permissionless, the crank handles it automatically. The 24-hour window may be unnecessary — could close accounts immediately after reputation updates complete.

### 10.2 Future Features

- **Commit epochs:** Optional time windows for defence commits, reducing behavioural inference
- **Paid seasons:** Optional entry-fee seasons with prize pool distribution
- **Winner NFT:** Unique NFT showing final map state
- **Push notifications (beyond Telegram):** Mobile push, email alerts
- **Multi-step escalation:** Gradual ramp-up rather than single-step
- **Replay system:** Animated season replay from event history
- **Multiple map regions:** Asia, Americas, Africa, or individual countries
- **Terrain effects:** Mountains, forests, plains with different costs/bonuses
- **Diplomacy:** In-game signalling (non-binding alliances)
- **Tournament mode:** Multi-season tournament brackets
- **Mobile PWA:** Optimised mobile with push notifications
- **Custom NFT minting:** Commemorative map snapshots

---

## Appendix A: Payout Examples (Future Paid Seasons)

For a hypothetical paid season with 0.05 SOL entry fee:

| Players | Prize Pool | 1st (50%) | 2nd (25%) | 3rd (15%) | 4th-5th (5% each) |
|---------|-----------|-----------|-----------|-----------|-------------------|
| 10 | 0.5 SOL | 0.25 | 0.125 | 0.075 | 0.025 |
| 50 | 2.5 SOL | 1.25 | 0.625 | 0.375 | 0.125 |
| 100 | 5.0 SOL | 2.50 | 1.25 | 0.75 | 0.25 |
| 200 | 10.0 SOL | 5.00 | 2.50 | 1.50 | 0.50 |

A 5–10% platform rake could fund development and hosting.

## Appendix B: State Transition Diagram

```
Season Lifecycle:
    Created → LandRush → War → Escalation → Ended
                                                |
                                  Early Victory (threshold reached)
                                  OR Time Expiry → Finalization Crank → Winner Set
                                                → Reputation Updates (crank, permissionless)
                                                → Account Cleanup Crank
                                                → Rent returned to players/owners/admin

Attack Lifecycle:
    Launched → [countdown window] → Revealed → AttackerWon / DefenderWon
                                  → Timed Out → DefaultWin (attacker, tiered energy cost)
    (One active attack per hex at any time)
    Attack account closed on resolution → rent returned to attacker

Hex Lifecycle:
    Unclaimed → Claimed (Land Rush or War)
    Owned → Attacked → Defended / Lost
    Owned → Ownership transferred (combat) → Occupation Shield (30min)
    Owned → Successfully defended → Combat Cooldown (60min)
    All hexes → Account closed (season end) → rent returned to current owner

Defence Lifecycle:
    Uncommitted → Committed (Pedersen commitment stored, energy locked)
    Committed → Increased (new commitment replaces old, more energy locked)
    Committed → Revealed (via attack defence or voluntary withdrawal)
    Committed → Locked (hex under attack, cannot modify)
    Locked → Revealed/Lost (attack resolves) → Uncommitted

Player Account Lifecycle:
    Created (join_season) → Active during season → Finalized (season end)
    → Reputation updated → Account closed → rent returned to player wallet
```

## Appendix C: Energy and Points Calculation Example

**Scenario:** Player owns 15 standard hexes and 2 landmark hexes. Last update was 3 hours ago.

**Energy earned:**
- Standard: 15 hexes × 1 energy/hour × 3 hours = 45 energy
- Landmark: 2 hexes × 3 energy/hour × 3 hours = 18 energy
- Total: 63 energy added (capped at 500)

**Points earned:**
- Standard: 15 hexes × 1 point/hour × 3 hours = 45 points
- Landmark: 2 hexes × 5 points/hour × 3 hours = 30 points
- Total: 75 points added to cumulative score

**Victory pace:** With 17 hexes (including 2 landmarks), earning 25 points/hour, reaching 50,000 points takes 2,000 hours (83 days). A single player with this territory size cannot win before the 28-day deadline. They need to expand or hold more landmarks.

At 50 standard hexes + 5 landmarks (75 points/hour): ~28 days to reach 50,000. Dominating ~15% of the map with strong landmark control could trigger early victory near the season deadline. The victory threshold should be tuned based on map size and expected player counts.

## Appendix D: H3 Resolution Comparison

| Resolution | Avg Hex Area | Approx Hexes (Europe) | Character |
|------------|-------------|----------------------|-----------|
| 3 | ~12,000 km² | ~50 | Country-scale chunks |
| 4 | ~1,700 km² | ~350 | City/metro-scale |
| 5 | ~250 km² | ~2,500 | Town-scale |
| 6 | ~36 km² | ~17,000 | Neighbourhood-scale |

Resolution 4 is recommended for seasons with 10–100 players. Resolution 5 for 200+ players.

## Appendix E: Defence Commitment Walkthrough (Pedersen Commitments)

**Alice owns 5 hexes and has 200 available energy.**

1. Alice derives her season seed: `seed = SHA256(sign("Solvasion season seed:1"))`
2. She decides to allocate: hex A = 50, hex B = 30, hex C = 20, hex D = 0, hex E = 0
3. For each defended hex, she computes:
   - `r_A = HashToScalar(SHA256(seed || "defence_r" || 1 || hex_A_id || nonce_1))`
   - `C_A = 50·G + r_A·H`
   - (same for B and C with nonce_2, nonce_3)
4. She submits `commit_defence` with entries [(hex_A, compress(C_A), nonce_1), (hex_B, compress(C_B), nonce_2), (hex_C, compress(C_C), nonce_3)] and total_energy_delta = 100
5. On-chain: Alice's energy_balance goes from 200 → 100. energy_committed goes from 0 → 100. Each hex stores the compressed Ristretto point and nonce.
6. Other players can see: Alice has 100 energy committed. Hexes A, B, C have commitments. Hexes D, E do not. But the per-hex amounts are cryptographically hidden — even indexing every transaction reveals nothing.

**Alice wants to reinforce hex A without revealing her current allocation.**

7. She calls `increase_defence` with delta = 30. New total: a_new = 50 + 30 = 80.
8. She derives `r_new = HashToScalar(SHA256(seed || "defence_r" || 1 || hex_A_id || new_nonce))`
9. Computes `C_new = 80·G + r_new·H`
10. On-chain: energy_balance drops by 30 (100 → 70), energy_committed rises by 30 (100 → 130). Hex A's commitment is replaced with C_new.
11. Observers see: "Alice added 30 energy to hex A." But they don't know the total — it could be 30 + 30 = 60, or 200 + 30 = 230, or anything else. The original 50 remains hidden.

**Bob attacks hex B with 40 energy.**

12. Alice sees the attack and has 6 hours (or 12 if in her shield window) to respond.
13. She recovers her blinding factor: `r_B = HashToScalar(SHA256(seed || "defence_r" || 1 || hex_B_id || nonce_2))` (nonce_2 is stored on the Hex account)
14. She submits `reveal_defence` with energy_amount = 30 and blind = r_B.
15. Program verifies: `30·G + r_B·H == hex_B.defence_commitment`. Match confirmed. Bob's 40 > Alice's 30 — Bob wins.
16. Hex B transfers to Bob. Alice's energy_committed drops by 30 (to 100). Bob gets surplus 10 returned to his balance. Hex B's commitment is cleared.

**Season ends. Crank runs cleanup.**

17. Finalization completes. Winner is determined.
18. After 24 hours, the crank calls `close_season_hex` for each hex and `close_season_player` for each player.
19. Alice's Player account rent (~0.002 SOL) is returned to her wallet.
20. Hex accounts she owns at season end have their rent (~0.002 SOL each) returned to her wallet.
21. The Season account is retained permanently as a historical record.

## Appendix F: Pedersen Commitment Security Properties

**Information-theoretic hiding:** Given only the commitment `C = a·G + r·H`, an adversary (even with unbounded compute) cannot determine `a`. For any candidate value `a'`, there exists a blinding factor `r'` such that `C = a'·G + r'·H`. Without knowing `r`, the commitment is perfectly hiding.

**Computational binding:** A player cannot open a commitment to two different values `(a₁, r₁)` and `(a₂, r₂)` unless they can compute `log_G(H)` — which is computationally infeasible under the discrete log assumption in the Ristretto255 group (~128 bits of security).

**Why not ZK sum proofs?** The program cannot verify that the sum of per-hex hidden amounts equals `energy_committed` without a zero-knowledge proof of the sum. This is a non-goal for v1.3 — the existing trust model (over-allocation is self-harming) is sufficient. ZK sum proofs could be added in a future version if the trust model needs strengthening.

**Comparison to v1.1 (SHA256):**

| Property | v1.1 (SHA256) | v1.2 (Pedersen) |
|----------|--------------|-----------------|
| Hiding at commit time | Practical obscurity (aggregate delta) | Information-theoretic (unconditional) |
| Hiding against tx indexers | Weak (amounts in early design, aggregate in revised) | Strong (commitment reveals nothing) |
| Reinforce without reveal | Not possible (`recommit` leaks old amount) | Possible via `increase_defence` |
| Binding | Cryptographic (SHA256 collision resistance) | Cryptographic (discrete log hardness) |
| On-chain verification cost | ~5,000 CU (SHA256) | ~30,000 CU (Ristretto scalar mul) |
| Commitment size | 32 bytes | 32 bytes |

---

*End of specification.*

