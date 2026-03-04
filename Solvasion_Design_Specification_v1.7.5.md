# Solvasion — Design Specification v1.7.5

## Fully On-Chain Territory Conquest on Solana

**Author:** Dom Barker
**Date:** March 2026
**Status:** Draft (revised from v1.7 incorporating v1.7.1, v1.7.2, v1.7.3, and v1.7.4 additions: Guardian Auto-Reveal system, Clutch Defence bonus, expanded reveal_defence caller, guardian sync status, ClutchDefence and GuardianRevealSubmitted events)

---

## Changelog from v1.7.4

- Added Section 3.5.1: `AttackResolved` event contract with complete payload specification
- Added Section 4.3.5.1: `GuardianFailure` notification contract with trigger definition, payload, and transport
- Added Section 5.6: v1.7.5 UX Addendum — Player Experience Pre-Mortem (11 rage-quit scenarios, 3 MVP non-negotiables, 22 spec additions, 3 cross-team data contracts)

## Changelog from v1.7.3

- **Guardian Auto-Reveal system (per-hex packet model)** — Opt-in non-custodial auto-reveal service. Guardian stores encrypted per-hex reveal packets, not the season seed. Each packet contains only the material needed to reveal one specific hex at its current commitment. Guardian can only submit `reveal_defence` transactions — cannot move funds, change ownership, launch attacks, or modify commitments. Player account gains `guardian: Option<Pubkey>`. New instructions: `set_guardian`, `clear_guardian`. `reveal_defence` updated to accept calls from either hex owner or registered guardian. v1 enrolment UX is account-level (all non-zero committed hexes enrolled automatically); per-hex opt-in/out deferred to v2.
- **Clutch Defence bonus** — Manual players who reveal in the final 60 minutes of an attack window and win earn `clutch_defence_bonus_points` (default 12). Guardian users are ineligible (guardian reveals immediately). Season account gains `clutch_defence_bonus_points: u32` and `clutch_window_seconds: i64`.
- **`reveal_defence` caller expanded** — Instruction now accepts reveals from `hex.owner` OR `player.guardian` (if set). Guardian submits identical `(energy_amount, blind)` opening. Clutch window check added post-resolution.
- **Guardian ON/OFF legibility** — Battle results include whether defender used guardian auto-reveal. War feed and battle reports surface this for strategic legibility.
- **`ClutchDefence` event added** — Emitted when clutch bonus triggers. War feed renders "Clutch Defence! +12".
- **`GuardianRevealSubmitted` event added** — On-chain program event emitted inside `reveal_defence` when a guardian-authorised reveal is accepted (pre-resolution). `AttackResolved` gains `guardian_reveal: bool`.
- **Guardian sync status** — Client auto-creates and uploads encrypted reveal packets on every defence operation. Visible sync indicator per hex.

## Changelog from v1.7.2

- **Phase enum expanded to five variants** — `LandRush | War | EscalationStage1 | EscalationStage2 | Ended`. Matches `effective_phase()` logic.
- **Defence workflow clarified** — `commit_defence` is for hexes with no commitment; `increase_defence` is the primary flow for freshly claimed hexes (which have a mandatory zero-commitment from claim). Section 2.5 rewritten with explicit workflows.
- **Defence lifecycle documented** — New Section 2.5.8 explains the full commit → reinforce → reveal → recommit cycle. Defence energy consumed on reveal is intentional design.
- **Defender-win cooldown increased to 4 hours** — `defender_win_cooldown_seconds` default changed from 3600 to 14400. Post-combat recommit UX added (Section 5.2.5.2).
- **Phantom energy estimate replaced with flat recovery** — `phantom_recovery_energy` (default 25) replaces crude average calculation. PhantomRecovery account simplified.
- **Energy rounding specified** — `floor((seconds_elapsed * rate) / 3600)` for all energy and points calculations. Sub-hour fractions lost on each update.
- **Region Merkle proof eliminated** — Region IDs stored directly in ValidHexSet via parallel `region_ids` array. Removes `region_map_root` from Season, removes proof parameters from `claim_hex`. Single validation paradigm.
- **`recommit_defence` delta made unsigned** — `energy_delta` changed from `i32` to `u32`. Instruction is now atomic withdraw + commit with no signed arithmetic.
- **`increase_defence` allowed during Land Rush** — Phase check expanded to include LandRush.
- **`clear_phantom_energy` simplified** — Fast-path: if `hex_count == 0`, zero out immediately. General case de-scoped.
- **WebSocket spec added** — New Section 4.5.1 specifies client WebSocket protocol with cursor-based resume.
- **Theatre selection verifiability** — Commit-reveal selection, no-consecutive-region constraint, and `theatre_window_index` counter added.
- **Crank wallet monitoring** — SOL balance alerts and burn projection added to Section 4.3.2.
- **Database schema updated** — `region_id` column added to `hexes` table.
- **Stale references cleaned up** — `has_territory` reference removed, account size estimates flagged for recount, stale `region_id` field comment updated.
- **Cloud defence backup default-on** — Section 5.5.2 updated.
- **Open questions updated** — SeasonCounters contention documented as known scaling limit. Simulation requirement added to build plan.

## Changelog from v1.7

- **Theatre expiry invariant** — `now < season.theatre_expires_at` is the sole authoritative theatre activity check. Sanity bounds enforce 49-hour maximum and positive duration on `set_active_theatres`.
- **Region assignment via Merkle proof** — `claim_hex` requires a Merkle proof of `(hex_id, region_id)` verified against `region_map_root` on Season account. Fixes exploit where unvalidated `region_id` allowed theatre bonus farming.
- **Merkle proof format specified** — proof includes direction flags (u16 bitfield). Left/right ordering, tree construction, and verification algorithm fully defined.
- **Capture bonus gating simplified** — bonus awarded on any `reveal_defence` attacker-wins capture, regardless of defender's revealed amount. No bonus on timeout.
- **Attack refund arithmetic specified** — floor rounding, energy cap respected, explicit threshold check.

## Changelog from v1.6

- **Theatre model corrected: event-driven, not passive** — Theatre bonuses now apply as flat point grants at capture/defence time, not as hourly income multipliers. Removes `theatre_hex_count` and `theatre_landmark_count` from Player account. Section 2.8 rewritten.
- **RegionMap account eliminated** — Region assignment simplified; verified via Merkle proof against `region_map_root` on Season account (further refined in v1.7.1).
- **Multiplier stacking capped** — Theatre bonuses no longer interact with landmark escalation multipliers (flat grants, not rate multipliers).
- **Capture bonus points** — Flat on-chain point grant to attacker on contested capture only (prevents bot/AFK farming). Section 2.4.8 updated.
- **Attack refund on failed attacks** — Partial energy refund when defender wins, only above 2× minimum attack energy threshold. Section 2.4.9 updated.

## Changelog from v1.5

- **Mandatory bluff commitments** — `claim_hex` now requires a client-generated Pedersen commitment (to zero) at claim time. All hexes appear identically committed on-chain, closing the `has_commitment` information leak.
- **Named regions** — frontend region layer maps hex IDs to named European regions used throughout UI, war feed, and notifications.
- **War feed** — real-time event feed surfacing attacks, captures, defences, reinforcements, and phase changes as narrative events. Section 5.2.8 added.
- **Frontline visualisation** — contested borders and recently active zones highlighted on the map.
- **Theatre Objectives (on-chain)** — rotating 48-hour regional point multipliers stored on-chain. Theatre multipliers affect on-chain points that determine victory. Section 2.8 added.
- **Narrative bot system** — bots upgraded to named factions with announced goals, taunt lines, and incursion events. Section 4.3.4 updated.
- **Daily briefing** — Telegram summary of overnight events, territory changes, and emerging threats.
- **Contracts and bounties** — off-chain daily/weekly objectives with cosmetic rewards. Section 4.3.6 added.
- **Retaliation token (deferred)** — successful defenders earn a counter-attack token usable within 24 hours at reduced energy cost. Section 2.4.7 added.
- **Posture system (deferred)** — public intent signals (Fortifying, Mobilising, Standing Down). Section 2.9 added.
- **Two-step escalation with landmark decisiveness** — escalation split into two stages; Stage 2 makes landmarks dramatically more valuable.
- **Capture bonus points** — flat on-chain point bonus on hex capture plus daily bonus on rolling 24h cooldown. Section 2.4.8 added.
- **Attack refund** — 25% energy refund to attackers who lose combat. Section 2.4.9 added.

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

**Escalation (two stages with landmark decisiveness):** Escalation activates in two stages to create a graduated endgame ramp. Stage 2 additionally makes landmarks dramatically more valuable, forcing conflict at fixed geographic positions in the final days.

- **Escalation Stage 1 (activates at configurable time, default Day 18):** Moderate increase. Energy income multiplier ×1.5, attack cost multiplier ×0.85. Landmark point rates receive the standard multiplier (5 × 1.5 = 7.5 points/hour).
- **Escalation Stage 2 (activates at configurable time, default Day 24):** Aggressive increase. Energy income multiplier ×2.5, attack cost multiplier ×0.6. Landmark point rates receive a separate, much higher multiplier: 5 × 5 = 25 points/hour (configurable via `escalation_stage_2_landmark_multiplier_bps`). Standard hex point rates receive the normal Stage 2 multiplier (1 × 2.5 = 2.5 points/hour).

**Landmark decisiveness rationale:** In the final 4 days of a season, landmarks generating 25 points/hour are 10× more valuable than standard hexes at 2.5 points/hour. A player holding 5 landmarks generates 125 points/hour from landmarks alone — equivalent to holding 50 standard hexes. This means turtling with a large number of standard hexes in a quiet corner is not a viable path to victory in the endgame. Players must contest landmarks to win, and landmarks are fixed geographic positions (Paris, London, Berlin, etc.) that everyone knows about. This guarantees decisive late-game conflict at known locations.

**Interaction with theatres:** Theatre bonuses are flat point grants earned at capture/defence time, not hourly rate multipliers. They do not compound with the Stage 2 landmark multiplier. A landmark in an active theatre during Stage 2 earns its normal 25 points/hour plus a flat theatre capture bonus (default 100 points) if captured. There is no multiplicative stacking.

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

When `hex_count` is 0, the next `claim_hex` call waives the adjacency requirement (subject to the respawn limit).

**Respawn limit:** Each player has a maximum number of respawns per season (configurable, default 3). After exhausting respawns, a player who loses all territory is effectively eliminated — they retain their Player account, accumulated points, and available energy, but cannot claim new hexes without adjacency to existing territory (which they no longer have). This prevents harassment playstyles where eliminated players endlessly re-enter to disrupt leaders.

The respawn count is tracked via `respawn_count` on the Player account and checked during `claim_hex` when the adjacency requirement would be waived.

### 2.3 Energy System

Energy is the game's single resource. It is earned passively from territory and spent on all actions.

#### 2.3.1 Energy Income

- **Standard hex:** 1 energy per hour
- **Landmark hex:** 3 energy per hour
- **Energy cap:** 500 energy maximum stored (prevents extreme hoarding, encourages regular engagement)
- **Accumulation while offline:** Energy accumulates based on territory held, up to the cap

Energy income is not tracked in real-time on-chain. Instead, energy is calculated lazily: when a player takes an action, the program computes energy earned using floor division:

```
seconds_elapsed = now - last_energy_update
energy_earned = floor((seconds_elapsed * (standard_hexes * base_rate + landmark_hexes * landmark_rate)) / 3600)
```

The result is added to the player's stored balance (capped at 500), then the action cost is deducted. The Player account stores `last_energy_update` timestamp (set to `now` after every calculation) and the program calculates current energy on demand.

**Rounding behaviour:** Sub-hour fractions are effectively lost on each update because `last_energy_update` is set to `now`, not adjusted for the remainder. This is acceptable because actions happen frequently enough that the loss is negligible, and it keeps the arithmetic simple. All energy calculations use `u32` arithmetic with `floor()` (truncation toward zero).

During Escalation, the energy income multiplier is applied before the time calculation: `adjusted_rate = floor(base_rate * multiplier_bps / 10000)`.

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
- **Attacker energy ≤ Defender energy:** Defender wins. Hex ownership remains. The defender's revealed `energy_amount` is deducted from their `energy_committed` (commitment consumed — they must recommit). The attacker loses all committed energy (already deducted at launch). A 4-hour recommit grace window is applied to the hex (`last_combat_resolved` timestamp set), providing safe time for the defender to restore hidden defence.

**If the defender does not reveal within the deadline:**

Attacker wins by default. Hex ownership flips regardless of what the hidden allocation was. The defender's committed energy for that hex is lost (phantom energy — see Section 3.2.3). Anyone can call `resolve_timeout` to execute this after the deadline. Energy returned to attacker = `max(0, energy_committed - season.min_attack_energy)` — the attacker always loses at least `min_attack_energy` (default 10), preventing free griefing spam.

#### 2.4.4 Post-Combat

After combat resolution (whether via reveal or timeout), the hex's defence commitment is cleared. The new owner (or existing owner after a successful defence) must submit a fresh commitment to defend the hex.

Every combat interaction reveals information. If the defender reveals, the attacker learns the exact defence value of that hex. If the defender doesn't reveal, everyone learns that the defender was offline or chose not to defend. This information leakage is a core part of the strategic texture — it makes the game more interesting over time as players build models of each other's behaviour.

Every reveal discloses the defence amount for that specific combat. This is permanent — all observers learn the exact value. The defender's mitigation is not hiding the reveal, but recommitting promptly to restore uncertainty. A post-combat recommit with a different amount creates a fresh commitment that opponents cannot connect to the old value.

#### 2.4.5 Timezone Shield

To prevent the game from degenerating into "who sleeps least wins," each player can configure a daily timezone shield — a 6-hour window (e.g. 23:00–05:00 UTC) during which attacks against their hexes have their resolution deadline extended from 6 hours to 12 hours.

The shield window is stored in the Player account as `shield_start_hour` (0–23 UTC) and is 6 hours long. When `launch_attack` creates an Attack account, the program checks whether the current timestamp falls within the defender's shield window. If so, the deadline is set to `now + 12 hours` instead of `now + 6 hours`.

Players can change their shield window at any time, but changes take effect after a 24-hour delay to prevent tactical abuse (e.g. seeing an incoming attack and instantly shifting your shield to cover it).

**Strategic note:** The shield extension triggers based on whether the attack is *launched* during the defender's shield window, not whether the *deadline* falls within it. This means a sophisticated attacker can choose to launch attacks just outside the shield window to force the shorter 6-hour deadline. This is intentional — the shield is designed as a sleep-protection safety net, not an impenetrable fortress. Players who are aware of this timing dynamic can use shield window visibility (all players' shield hours are public) as strategic information, and defenders can set their shield window to cover the period when they are least able to respond, accepting that the boundaries are soft.

Default shield: 22:00–04:00 UTC (covers European nighttime). Players can adjust to their actual timezone.

#### 2.4.6 Occupation Shield and Combat Cooldown

Post-combat cooldowns prevent immediate re-attacks and reward active defence:

- **Attacker wins (capture):** 30-minute occupation shield (hex cannot be attacked)
- **Defender wins (successful defence):** 4-hour combat cooldown / recommit grace window (hex cannot be attacked)
- **Timeout (attacker wins by default):** 30-minute occupation shield

The occupation shield is implemented as a `last_owner_change` timestamp on the Hex account. The combat cooldown uses a `last_combat_resolved` timestamp. The `launch_attack` instruction checks both before allowing an attack.

Successful defence is rewarded with significantly MORE protection than a capture. The 4-hour window is intentionally longer to provide a safe recommit grace period — the defender's commitment was consumed during combat and they need time to restore hidden defence.

**Cooldown configurability:** Both `defender_win_cooldown_seconds` (default 14400 = 4 hours) and `capture_cooldown_seconds` (default 1800) are configurable per season. Note: `occupation_shield_seconds` controls the `last_owner_change` check, while `capture_cooldown_seconds` controls the `last_combat_resolved` check. Both apply after a capture (both timestamps are set), so the effective post-capture cooldown is `max(occupation_shield_seconds, capture_cooldown_seconds)`. With defaults both are 30 minutes, so they overlap. The defender win cooldown (4 hours) only uses `last_combat_resolved`.

The two cooldowns serve different purposes and have intentionally different defaults: post-capture cooldown (30 min) is a brief anti-ping-pong measure; post-defence cooldown (4 hours) is a recommit grace window that protects the defender while they restore hidden defence.

#### 2.4.7 Retaliation Token (deferred feature)

When a defender successfully reveals and wins combat (attacker energy ≤ defender energy), the defender earns a **retaliation token**. This token allows the defender to launch a discounted counter-attack against the attacker within 24 hours, targeting any attacker-owned hex adjacent to the defender's territory.

**Token grant:** On successful defence, the defender's Player account is updated with `retaliation_target` (attacker's pubkey), `retaliation_expires` (now + 24h), and `retaliation_discount_bps` (configurable, default 5000 = 50% energy cost reduction).

**Token use:** When launching an attack via `launch_attack`, if the attacker has a valid retaliation token targeting the defender of the hex being attacked, the minimum attack energy and energy cost are reduced by the discount percentage. The token is consumed after use.

**Token cap:** One token at a time. If the same target attacks again and the defender wins, the existing token's expiry is extended. If a different target is involved, the newer token replaces the older one.

**Design rationale:** Failed attacks don't just waste energy — they expose the attacker's border to a discounted counter-strike. This makes probing attacks riskier and rewards active defence.

#### 2.4.8 Capture Bonus Points

Every successful contested capture awards a flat on-chain point bonus to the attacker.

**Capture bonus:** On capture via `reveal_defence` (attacker wins, i.e. `attack.energy_committed > energy_amount`), the attacker receives `season.capture_bonus_points` (default 50) added to their `points` field. Awarded unconditionally when the defender reveals -- no check on energy_amount value. Ties (equal energy) go to defender per existing rules; no bonus awarded.

**Not awarded on timeout:** Capture bonus is NOT awarded on `resolve_timeout`. Only contested captures (where the defender showed up and revealed) earn the bonus.

**Theatre interaction:** Theatre capture bonuses and general capture bonuses stack additively. A contested capture in an active theatre earns `capture_bonus_points + theatre_capture_bonus_points`.

#### 2.4.9 Attack Refund

When an attacker loses combat (defender reveals and wins), a percentage of the attacker's committed energy is refunded, reducing the cost of probing enemy defences. Only applies above a minimum threshold.

**Refund on defender win:** `refund = floor(attack.energy_committed * season.attack_refund_bps / 10000)` (default 2500 = 25%). Added to attacker's `energy_balance`, capped at `season.energy_cap`. Floor rounding (truncate toward zero). Consistent with all other energy-addition operations in the program.

**Threshold:** Refund only applies when `attack.energy_committed >= season.min_attack_energy * season.attack_refund_min_threshold_multiplier` (default multiplier 2, so threshold = 20 energy). Minimum-energy probes (10 energy) get no refund.

**Separation from attacker-wins surplus:** The refund applies only in the defender-wins path. In the attacker-wins path, the existing surplus return logic is unchanged. The two mechanisms are mutually exclusive.

**Example scenarios:**

| Attack energy | Defender reveals | Outcome | Threshold met? | Energy returned |
|---|---|---|---|---|
| 10 | 15 | Defender wins | No (10 < 20) | 0 |
| 20 | 25 | Defender wins | Yes (20 >= 20) | 5 (floor of 20 * 0.25) |
| 30 | 40 | Defender wins | Yes (30 >= 20) | 7 (floor of 30 * 0.25) |
| 80 | 100 | Defender wins | Yes (80 >= 20) | 20 (floor of 80 * 0.25) |
| 50 | 30 | Attacker wins | N/A (different path) | 20 (surplus, not refund) |

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

**Mandatory initial commitment:** Every hex receives a Pedersen commitment at claim time. The `claim_hex` instruction now requires an `initial_commitment: [u8; 32]` parameter and an `initial_nonce: u64` parameter. The client generates a commitment to 0 energy using a blinding factor derived from the player's season seed and the nonce (Section 2.5.2) and passes it alongside the claim. The program stores the commitment on the Hex account and sets `has_commitment = true`.

This means every owned hex on the map has a commitment from the moment it is claimed. Observers cannot distinguish a freshly claimed hex with 0 defence from one with 200 defence committed. The `has_commitment` field is always true for owned hexes, eliminating the information leak present in earlier versions.

The client stores the initial 0-energy allocation in the defence ledger (Section 5.5.1) and can later use `increase_defence` to add real defence energy without revealing that the hex previously had 0.

**Defence workflows (two distinct paths):**

1. **First defence after claim (most common):** Use `increase_defence`. The hex already has a zero-commitment from claim. The player adds energy via `increase_defence` (delta = desired amount, new commitment = desired_amount·G + r_new·H). This is the normal flow for all freshly claimed hexes.
2. **After withdrawal or combat:** The hex has `has_commitment = false` (cleared during reveal/withdraw). Use `commit_defence` to create a fresh commitment. This is the recovery/reallocation flow.
3. **Reinforcing an existing defence:** Use `increase_defence` on any hex with an existing commitment to add more energy.

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

**Defence energy is locked.** Energy committed to defence cannot be freely returned to available balance. To unlock or reallocate committed energy, a player must reveal via `withdraw_defence` or `recommit_defence` (both expose the old allocation) or wait for combat resolution via `reveal_defence`.

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

#### 2.5.8 Defence Lifecycle

The full lifecycle of a hex's defence:

1. **Claim** creates a mandatory bluff commitment (commitment to 0 energy).
2. **Reinforce** via `increase_defence`. Player adds real energy. Observers see the delta but not the total.
3. **If attacked**, the defender must reveal within the countdown window.
4. **Win or lose: defence energy is consumed and the commitment clears.** This is intentional — defending costs energy, even when successful. The revealed amount becomes public.
5. **If the defender wins**, the hex enters a recommit grace window (4-hour cooldown). The hex cannot be attacked during this window.
6. **Post-combat recommit** creates a fresh commitment and restores uncertainty.

The "defence consumed on reveal" rule creates the strategic tension of "how much do I commit?" If defence were free, players would always commit their maximum, eliminating the allocation dilemma.

### 2.6 Points and Victory

#### 2.6.1 Point Accumulation

Points accumulate continuously based on territory held:
- **Standard hex:** 1 point per hour
- **Landmark hex:** 5 points per hour

Like energy, points are calculated lazily on-chain using the same floor division formula: `points_earned = floor((seconds_elapsed * (standard_hexes * points_rate + landmark_hexes * landmark_points_rate)) / 3600)`. The `last_points_update` timestamp is set to `now` after each calculation (sub-hour fractions lost, same rationale as energy).

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

### 2.8 Theatre Objectives

#### 2.8.1 Overview

Theatre Objectives are rotating regional designations that create geographic focal points for conflict. Every 48 hours, the admin (via crank) designates 2-3 named regions as active theatres. Capturing or defending hexes within an active theatre earns bonus on-chain points at the moment of combat resolution.

Theatre bonuses are **event-driven, not passive**. Holding territory in a theatre region does not generate bonus hourly income. Instead, the bonus is earned when you *fight* in a theatre -- capturing a theatre hex or successfully defending one. This ensures theatre points are always correct at the moment they are minted (no stale counters, no reconciliation lag), and that theatres reward aggression rather than passive holding.

#### 2.8.2 Region Definitions

The map is divided into named regions. Each region is identified by a `region_id` (u8, 1-15). Every hex belongs to exactly one region.

**Region assignment at claim time:** The `claim_hex` instruction reads the `region_id` directly from the ValidHexSet account. The ValidHexSet stores a parallel `region_ids` array indexed identically to `hex_ids` — when the binary search locates the hex, the region_id is read at the same index. This prevents malicious clients from claiming hexes with incorrect region IDs to farm theatre bonuses, with no Merkle proofs or off-chain dependencies required.

| Region ID | Region Name | Approximate Coverage |
|-----------|------------|---------------------|
| 1 | British Isles | UK + Ireland hexes |
| 2 | Iberian Peninsula | Spain + Portugal |
| 3 | Gallic Heartland | France |
| 4 | Low Countries | Belgium, Netherlands, Luxembourg |
| 5 | Alpine Corridor | Switzerland, Austria |
| 6 | Italian Peninsula | Italy |
| 7 | Balkans | Southeast Europe (Greece through Croatia) |
| 8 | Central Europe | Germany, Poland, Czech Republic |
| 9 | Scandinavia | Norway, Sweden, Denmark, Finland |
| 10 | Baltic States | Estonia, Latvia, Lithuania |
| 11 | Eastern Marches | Ukraine, Belarus, western Russia |
| 12 | Anatolian Gate | Turkey and eastern Mediterranean |

#### 2.8.3 Theatre Activation

Active theatres are stored on the Season account and updated by the admin via `set_active_theatres`. The crank calls this every 48 hours, selecting 2-3 regions weighted by number of distinct owners in region, excluding regions active in the previous window.

**Commit-reveal selection:** The crank commits `SHA256(salt || selected_regions)` on-chain 24 hours before activation, then reveals at activation time. This proves selection wasn't changed after observing player movements.

**No-consecutive constraint:** `set_active_theatres` rejects if any `region_id` was in the previous `active_theatres` array. Simple on-chain check.

**Theatre window index:** `theatre_window_index: u32` on the Season account tracks the incrementing window counter alongside `theatre_activated_at`. Anyone can verify "window N activated regions [X, Y] at time T."

**Theatre expiry invariant:** A theatre is active if and only if `hex.region_id` is in `season.active_theatres` AND `now < season.theatre_expires_at`. If the expiry has passed, theatres are inactive regardless of stale array contents. This is the sole condition checked in `reveal_defence` and `resolve_timeout`.

**Sanity bounds on `set_active_theatres`:** `expires_at` must be in the future (`> now`) and within 49 hours (`<= now + 176400`). The 1-hour grace beyond the 48-hour standard window accommodates crank scheduling variance.

#### 2.8.4 Theatre Bonus Application

Theatre bonuses are applied during combat resolution. No scanning, no counters, no reconciliation.

In `reveal_defence`: after combat resolution, check if `hex.region_id` is in `season.active_theatres` and `now < season.theatre_expires_at`. If both true: attacker wins -> add `theatre_capture_bonus_points` to attacker's points; defender wins -> add `theatre_defence_bonus_points` to defender's points.

In `resolve_timeout`: same region check. If in active theatre, add `theatre_capture_bonus_points` to attacker's points. No defence bonus on timeout.

#### 2.8.5 Theatre Strategic Impact

- **Passive holding in a theatre:** No bonus.
- **Capturing in a theatre:** +100 points per capture (default).
- **Defending in a theatre:** +50 points per successful defence.
- **No multiplier stacking:** Theatre bonuses are flat grants, not rate multipliers. They do not compound with landmark escalation multipliers. A landmark in a theatre during Stage 2 earns its normal 25 pts/hr plus a flat capture bonus if captured.
- **Endgame tuning:** Theatre capture/defence bonuses are season parameters, configurable higher during escalation.

### 2.9 Posture System (deferred feature)

#### 2.9.1 Overview

Postures are public intent signals that players set to communicate strategy. They are visible on the map, in the war feed, and on player profiles. Postures have no direct mechanical effect on combat — they are communication tools that create social gameplay.

#### 2.9.2 Posture Types

A player can set one active posture at a time. Postures last 24 hours and then expire automatically.

| Posture | Target | Visible Effect |
|---------|--------|---------------|
| **Fortifying** | A specific hex or region | Shield icon + feed event. "I am defending this position." |
| **Mobilising** | A specific region | Sword icon + warning glow + feed event. "I am preparing to attack here." |
| **Standing Down** | A specific player | Handshake icon + feed event. "I am not attacking this player for 24 hours." Breaking this costs 500 season XP (off-chain penalty). |

#### 2.9.3 Standing Down — Reputation Penalty

The "Standing Down" posture is not enforced on-chain — a player can still attack the target. However, the backend tracks violations: the attacker loses 500 season XP, the war feed announces the betrayal, and they receive a "Truce Breaker" badge. The on-chain attack proceeds normally, preserving the "program is sole authority" principle while making betrayal socially costly.

### 2.10 Guardian Auto-Reveal

#### 2.10.1 Overview

The Guardian is an opt-in auto-reveal service that submits `reveal_defence` transactions on a player's behalf when their hexes are attacked. It exists to solve the core accessibility problem: a player who cannot reach their device within the 6-hour (or 12-hour) attack window loses territory and committed energy regardless of how strong their defence allocation was.

The Guardian is positioned as accessibility assistance for casual play, not a required feature or a power tool. Manual reveal remains the default and retains a small but meaningful mechanical advantage (Clutch Defence bonus, Section 2.11).

#### 2.10.2 Design Principles

**Purely defensive.** The Guardian can do exactly one thing: submit a `reveal_defence` transaction for a commitment the player already made. It cannot move funds, change hex ownership, launch attacks, modify commitments, withdraw energy, or perform any action other than revealing an existing defence.

**Non-custodial, per-hex trust boundary.** The Guardian does not hold the player's season seed. It holds individual encrypted reveal packets — one per enrolled hex. Each packet contains only the material needed to reveal that specific hex at its current commitment level. A compromised Guardian leaks only the hexes that have active packets, not the player's entire allocation strategy or seed material.

**Always-reveal policy.** The Guardian always reveals the full committed amount immediately. There is no strategic logic, no partial reveals, no conditional behaviour. This is intentional — it makes guardian behaviour fully predictable to opponents and preserves the strategic distinction between guardian and manual play.

**Failover to manual.** If the Guardian service is down, unreachable, fails to submit a reveal, or lacks a synced packet for a specific hex, the player can always reveal manually using their wallet. The on-chain program accepts reveals from either the player or their registered guardian — both paths remain open at all times.

#### 2.10.3 Trust Model

The Guardian holds per-hex reveal packets, each containing the energy amount and blinding factor for one hex at its current commitment. This means:

- A compromised Guardian could leak defence allocation amounts for enrolled hexes only.
- It cannot derive allocations for hexes the player has not enrolled (no seed access).
- It cannot reconstruct historical allocations (packets are replaced on every recommit/increase).
- Defence amounts are revealed to all observers on every combat interaction anyway (Section 2.4.4). The Guardian knowing them in advance is a timing advantage for that specific hex, not a categorical information leak.
- The Guardian cannot act on this information beyond submitting reveals — it has no wallet authority.

**Blast radius on compromise:** Only the currently enrolled hexes at their current commitment values are exposed. The player's overall strategic posture (how energy is distributed across non-enrolled hexes, total energy balance, seed material) remains hidden.

**Player psychology:** "I gave it these specific hexes" is an easier trust model than "it has my master key." Players understand sealed envelopes. They are less comfortable with skeleton keys.

For v1, the Guardian service is operated by the game admin (hosted on existing NUC infrastructure). Future versions may support player-chosen third-party guardians or self-hosted instances.

#### 2.10.4 Per-Hex Reveal Packet

Each reveal packet contains the minimum material the Guardian needs to construct a valid `reveal_defence` transaction for one hex.

**Packet contents:**

| Field | Type | Description |
|-------|------|-------------|
| `packet_format_version` | `u8` | Packet format version. `1` = Pedersen opening; `2` = SHA256 fallback opening. |
| `season_id` | `u64` | Season identifier |
| `hex_id` | `u64` | Target hex H3 index |
| `owner_pubkey` | `[u8; 32]` | Hex owner's wallet pubkey |
| `energy_amount` | `u32` | Committed defence energy |
| `opening_bytes` | `[u8; 32]` | Pedersen: blinding factor scalar bytes. SHA256: salt bytes. |
| `defence_nonce` | `u64` | Nonce used for this commitment (for sanity-checking against chain) |
| `packet_version` | `u64` | Monotonically increasing version, incremented on every recommit/increase |

**Encryption:** Each packet is encrypted with a symmetric key established during Guardian enrolment (Section 2.10.6). The Guardian decrypts packets on demand when an attack triggers a reveal.

**Storage:** The Guardian service stores one packet per `(season_id, wallet, hex_id)`. When a new packet arrives for an existing key, it replaces the old one. The `packet_version` field ensures the Guardian always uses the latest commitment — if the on-chain `defence_nonce` doesn't match the packet's `defence_nonce`, the packet is stale and the Guardian cannot reveal (player alerted).

**Packet lifecycle:**
- Created: when defence is committed to a guardian-enrolled hex (`commit_defence`, `increase_defence`, `claim_hex` initial commitment if non-zero).
- Replaced: on every `increase_defence` or `recommit_defence` for that hex.
- Deleted: when the hex is lost (combat/timeout), defence is withdrawn, or Guardian is disabled.
- Stale: if `defence_nonce` on-chain doesn't match packet. Guardian treats stale packets as unusable.

**Zero-commitment hexes:** No packet is created for hexes with only the mandatory zero-commitment from `claim_hex`. A packet is created when the player first calls `increase_defence` on that hex. Revealing a zero-commitment has no strategic value.

#### 2.10.5 On-Chain Mechanism

The Player account gains a new field:

| Field | Type | Description |
|-------|------|-------------|
| `guardian` | `Option<Pubkey>` | Authorised guardian delegate pubkey. None = manual only. |

**Size impact:** +33 bytes (1 byte Option discriminant + 32 bytes Pubkey) for `guardian`, +4 bytes for `clutch_defences`. Total +37 bytes. Player account size increases from ~291 to ~328 bytes.

Two new instructions manage the guardian relationship:

**`set_guardian`** — Player registers a guardian pubkey. Takes effect immediately (no delay — enabling a guardian does not disadvantage opponents; it only enables someone else to reveal your defences, which helps you).

**`clear_guardian`** — Player removes their guardian. Takes effect immediately. The Guardian service detects this via event indexer and deletes all stored packets for that player.

The `reveal_defence` instruction (Section 3.3.12) is updated:

**Caller verification (replaces existing check):**
```
if caller == attack.defender:
    // Direct player reveal — proceed
elif player.guardian == Some(caller):
    // Guardian reveal — proceed, set guardian_reveal = true
else:
    // Reject: NotAuthorisedToReveal
```

All subsequent verification logic (Pedersen opening, combat resolution, energy accounting) is identical regardless of who submitted the reveal. The only difference is event metadata: a `guardian_reveal: bool` field is added to the `AttackResolved` event for indexer/feed rendering.

#### 2.10.6 Guardian Service Architecture

The Guardian is a Node.js service running alongside the crank on the NUC.

**Enrolment flow:**
1. Player enables Guardian in frontend defence settings.
2. Client generates a random symmetric encryption key `K_guard`.
3. Client submits `set_guardian` transaction with the Guardian service's pubkey.
4. Client sends `K_guard` to the Guardian service over HTTPS (TLS-encrypted transport), authenticated by wallet signature. The Guardian stores `K_guard` encrypted at rest using envelope encryption (service-level master key wrapping the per-player symmetric key).
5. For each hex the player currently owns with a non-zero active commitment, the client generates an encrypted reveal packet (using `K_guard`) and uploads it to the Guardian.
6. Guardian confirms enrolment. Frontend shows "Guardian Active".

**Packet sync (automatic, background):**

When a guardian-enrolled player performs any defence operation, the client:
1. Submits the on-chain transaction (`commit_defence`, `increase_defence`, `recommit_defence`, `claim_hex`).
2. On transaction confirmation, auto-creates a new encrypted reveal packet for the affected hex.
3. Uploads the packet to the Guardian service in the background.
4. Frontend shows per-hex sync status: "Guardian synced" or "Syncing..." or "Not synced — manual reveal required".

**If upload fails:** Play is not blocked. The hex remains defended on-chain. The Guardian simply cannot auto-reveal that specific hex until the packet is re-synced.

**Attack monitoring and reveal:**
- Guardian subscribes to `AttackLaunched` events via the backend event indexer.
- On receiving an attack where the defender has Guardian enabled:
  1. Look up the stored packet for `(season_id, defender_wallet, target_hex_id)`.
  2. If no packet exists: alert player via Telegram.
  3. If packet exists: decrypt using stored `K_guard`.
  4. Sanity check: verify packet `defence_nonce` matches the on-chain hex `defence_nonce` via RPC query. If mismatch, packet is stale — alert player, do not reveal.
  5. Submit `reveal_defence` transaction signed by the Guardian's keypair.

**Timing:** Target: reveal submitted within 60 seconds. SLA: 5 minutes maximum under degraded conditions.

**Guardian wallet:** Dedicated Solana keypair, separate from crank wallet. Monitored alongside crank wallet (Section 4.3.2).

#### 2.10.7 Failure Modes

| Scenario | Behaviour | Player Impact |
|----------|-----------|---------------|
| Guardian service down | Player reveals manually | Telegram alert if possible |
| Packet not synced for attacked hex | Guardian cannot reveal that hex | Player alerted, manual reveal required |
| Packet stale (nonce mismatch) | Guardian does not reveal | Player alerted, manual reveal required |
| RPC failure on reveal submission | Retry with exponential backoff up to 5 min SLA | If all retries fail, player alerted |
| Player clears guardian on-chain | Guardian detects via event, deletes all stored packets and key | Guardian stops monitoring immediately |
| Guardian reveals with valid packet but tx fails on-chain | Retry. If commitment was cleared (hex already lost), stop. | Player may need to check outcome manually |

**Critical invariant:** The Guardian can never make things worse. If it fails, the player is in exactly the same position as if Guardian didn't exist — they have the full attack window to reveal manually.

#### 2.10.8 Revocation

A player can disable Guardian at any time:
1. Submit `clear_guardian` transaction (sets `player.guardian = None`).
2. Guardian service detects the on-chain change via event indexer.
3. Guardian deletes all stored packets and the symmetric key `K_guard` for that `(wallet, season_id)`.
4. Frontend updates to show "Guardian Off".

For key rotation without disabling Guardian:
1. Player triggers "Rotate Guardian Key" in settings.
2. Client generates a new `K_guard_new`.
3. Client sends the new key to the Guardian service (authenticated by wallet signature).
4. Client re-encrypts and re-uploads all active packets using the new key.
5. Guardian replaces stored key and packets atomically.

#### 2.10.9 UI Presentation

**Onboarding recommendation:** During the join flow, after the player's first hex claim, a one-time prompt:

> "Enable Guardian Auto-Reveal? Most players use Guardian for reliable defence. You can switch to manual mode anytime in Settings."
> [Enable Guardian] [Stay Manual]

**Defence settings panel:**

> **Guardian Auto-Reveal** [ON / OFF]
> When enabled, your defences are revealed automatically when attacked. You cannot earn Clutch Defence bonuses while Guardian is active.

**Manual mode description (shown when Guardian is OFF):**

> **Manual Reveal Mode (advanced):** Earn Clutch Defence bonuses by revealing in the final hour of an attack window. Warning: missed reveals lose your hex and committed energy.

**Per-hex sync status (in defence allocation UI):**
- "Guardian synced" — packet uploaded and current.
- "Syncing..." — upload in progress.
- "Not synced" — upload failed or packet stale. "Manual reveal required for this hex. [Retry Sync]"

**Battle results legibility:**
- War feed: "Auto-reveal enabled for defender." (when guardian submitted the reveal)
- Battle report: "Revealed by: Guardian" or "Revealed by: Manual"

#### 2.10.10 Guardian and Hex Enrolment

**v1 enrolment UX:** Guardian is enabled or disabled per player (account-level toggle). When enabled, the client automatically maintains encrypted reveal packets for all owned hexes with non-zero committed defence. The player does not choose individual hexes to enrol — enabling Guardian covers everything with a real commitment.

**Trust boundary remains per-hex:** Despite the account-level UX, the Guardian can only reveal hexes for which it holds a current, valid packet. Hexes with zero-commitment (initial bluff from `claim_hex`) have no packet and cannot be auto-revealed. If a packet upload fails for a specific hex, Guardian cannot reveal that hex — the per-hex trust boundary holds even when the UX is all-or-nothing.

**Per-hex opt-in/out (v2):** Future versions may allow players to exclude specific hexes from Guardian coverage. Deferred — v1 keeps the UX simple.

### 2.11 Clutch Defence

#### 2.11.1 Overview

Clutch Defence is a small point bonus awarded to players who reveal their defence manually in the final hour of an attack window and win the combat. It rewards the specific behaviour that makes manual play strategically interesting — late reveals that keep attackers uncertain — without making Guardian users feel like second-class citizens.

#### 2.11.2 Conditions

The `clutch_defence_bonus_points` (default 12) is awarded when ALL of the following are true:

1. **Final hour:** `attack.deadline - Clock::get()?.unix_timestamp <= season.clutch_window_seconds` (default 3600 seconds = 60 minutes).
2. **Active pending attack:** The attack exists and is pending (`attack.resolved == false` and `Clock::get()?.unix_timestamp <= attack.deadline`).
3. **Defender wins:** `energy_amount >= attack.energy_committed`.
4. **Manual reveal:** The reveal was submitted by the hex owner, not by a guardian delegate. Checked via: `caller == attack.defender`.

If all four conditions are met, `clutch_defence_bonus_points` is added to the defender's `points` field alongside normal combat resolution.

#### 2.11.3 Season Parameters

The Season account gains two new fields:

| Field | Type | Description |
|-------|------|-------------|
| `clutch_defence_bonus_points` | `u32` | Points awarded per Clutch Defence (default 12) |
| `clutch_window_seconds` | `i64` | Seconds before deadline qualifying as clutch (default 3600) |

These are set at season creation and immutable for the season duration.

#### 2.11.4 Anti-Gaming

Collusion farming — two friends staging low-stakes attacks to farm 12 points — is a bad trade by design. The attacker commits real energy (minimum 10), that energy is locked for up to 6 hours, and even with the 25% refund on loss they burn 75% of their stake. Spending 10+ energy and 6 hours of hex-lock time to generate 12 points for an ally is deeply inefficient.

**Contingency levers (not shipped, available if exploitation emerges):**
- Minimum attacker energy threshold for clutch eligibility (e.g., attacker must have committed >= 20 energy).
- Per-hex cooldown on clutch bonuses (e.g., max one clutch bonus per hex per 24 hours).
- Closeness band (e.g., defender wins by <= 20% of attacker energy).

These are documented as known tuning options, not shipped parameters.

**Once per attack_id:** The bonus is awarded exactly once per attack resolution.

#### 2.11.5 Interaction with Other Bonuses

Clutch Defence bonus stacks additively with all other point bonuses:
- Theatre defence bonus (if hex is in active theatre): +50 (default)
- Clutch Defence bonus: +12 (default)
- Both can apply to the same combat: a clutch defence in an active theatre earns 50 + 12 = 62 bonus points.

Clutch Defence bonus does NOT interact with escalation multipliers. It is a flat grant, not a rate modifier.

#### 2.11.6 Impact Analysis

At 12 points per Clutch Defence, assuming a highly active manual player achieves 20 clutch defences across a 28-day season:
- Total clutch bonus: 240 points
- As percentage of 50,000 victory threshold: 0.48%
- Enough to feel satisfying and create identity ("I'm a clutch player"), not enough to distort competitive outcomes or make Guardian feel punishing.

#### 2.11.7 Events

| Event | Key Fields |
|-------|------------|
| `ClutchDefence` | season_id, player, hex_id, attack_id, bonus_points |

Emitted immediately after combat resolution when clutch conditions are met.

#### 2.11.8 UI and War Feed

**War feed:** "Clutch Defence! [Player] held [hex name] in the final hour. +12"

**Battle report:** Clutch Defence bonus shown as a separate line item below standard combat results.

**Player stats:** New stat field: "Clutch Defences: X" — visible on player profile and season stats.

**Casual player safety:** For players with Guardian disabled, the first time a hex enters the final hour of an attack window, the UI shows a one-time tooltip: "Clutch Defence bonus available — but missing the deadline loses your hex. Reveal now for safety, or wait for the bonus."

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
| `phase` | `enum` | `LandRush`, `War`, `EscalationStage1`, `EscalationStage2`, `Ended` |
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
| `defender_win_cooldown_seconds` | `i64` | Post-successful-defence cooldown / recommit grace window (default 14400 = 4 hours) |
| `capture_cooldown_seconds` | `i64` | Post-capture/timeout cooldown (default 1800 = 30 min) |
| `max_respawns_per_season` | `u8` | Maximum free placement claims after losing all territory (default 3) |
| `points_per_hex_per_hour` | `u16` | Standard hex point rate |
| `points_per_landmark_per_hour` | `u16` | Landmark hex point rate |
| `victory_threshold` | `u64` | Points needed for early victory |
| `escalation_energy_multiplier_bps` | `u16` | Energy multiplier in basis points (e.g. 20000 = 2×) |
| `escalation_attack_cost_multiplier_bps` | `u16` | Attack cost multiplier (e.g. 7500 = 0.75×) |
| `escalation_stage_2_start` | `i64` | Timestamp when Escalation Stage 2 activates |
| `escalation_stage_2_energy_multiplier_bps` | `u16` | Stage 2 energy multiplier (e.g. 25000 = 2.5×) |
| `escalation_stage_2_attack_cost_multiplier_bps` | `u16` | Stage 2 attack cost multiplier (e.g. 6000 = 0.6×) |
| `escalation_stage_2_landmark_multiplier_bps` | `u16` | Stage 2 landmark-specific point multiplier (e.g. 50000 = 5×) |
| `active_theatres` | `[u8; 3]` | Up to 3 active theatre region IDs (0 = inactive slot) |
| `theatre_activated_at` | `i64` | Timestamp when current theatres were set |
| `theatre_expires_at` | `i64` | Timestamp when current theatres expire |
| `theatre_window_index` | `u32` | Incrementing theatre window counter for auditability |
| `theatre_commitment` | `[u8; 32]` | SHA256 commitment of next theatre selection (for commit-reveal) |
| `theatre_capture_bonus_points` | `u32` | Bonus points for capturing a hex in active theatre (default 100) |
| `theatre_defence_bonus_points` | `u32` | Bonus points for defending a hex in active theatre (default 50) |
| `capture_bonus_points` | `u32` | Points awarded per contested capture (default 50) |
| `attack_refund_bps` | `u16` | Attack energy refund on failed attack, basis points (default 2500) |
| `attack_refund_min_threshold_multiplier` | `u8` | Refund only when attack >= min_attack_energy * this (default 2) |
| `retaliation_discount_bps` | `u16` | Discount for retaliation tokens (default 5000 = 50%) |
| `phantom_recovery_energy` | `u32` | Flat energy recovery amount per phantom recovery (default 25) |
| `retaliation_window_seconds` | `i64` | Retaliation token validity (default 86400 = 24h) |
| `winner` | `Option<Pubkey>` | Winning player's wallet (set on season end) |
| `winning_score` | `u64` | Winner's final score |
| `finalization_leader` | `Option<Pubkey>` | Current leader during finalization crank |
| `finalization_leader_score` | `u64` | Current leader's score during finalization |
| `finalization_complete` | `bool` | Whether finalization has been completed |
| `cleanup_complete` | `bool` | Whether post-season account closure is complete |
| `landmark_count` | `u8` | Number of landmark hexes |
| `landmarks` | `[u64; 32]` | H3 indices of landmark hexes (max 32) |
| `clutch_defence_bonus_points` | `u32` | Points awarded per Clutch Defence (default 12) |
| `clutch_window_seconds` | `i64` | Seconds before deadline qualifying as clutch (default 3600) |

**Size:** ~740 bytes

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
| `retaliation_target` | `Option<Pubkey>` | Player this retaliation token can be used against |
| `retaliation_expires` | `Option<i64>` | When retaliation token expires |
| `retaliation_discount_bps` | `u16` | Retaliation energy cost discount |
| `posture_type` | `u8` | Current posture (0 = None, 1 = Fortifying, 2 = Mobilising, 3 = StandingDown) |
| `posture_target` | `u64` | Hex ID or region ID depending on posture type |
| `posture_target_player` | `Option<Pubkey>` | Target player for Standing Down |
| `posture_expires` | `Option<i64>` | When the posture expires |
| `guardian` | `Option<Pubkey>` | Authorised guardian delegate pubkey. None = manual only. |
| `clutch_defences` | `u32` | Count of Clutch Defences achieved (stats) |

**Size:** ~328 bytes

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
| `region_id` | `u8` | Region this hex belongs to (read from ValidHexSet during claim) |

**Size:** ~137 bytes

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
| `total_clutch_defences` | `u64` | Lifetime Clutch Defences (cross-season brag stat) |

**Size:** ~128 bytes

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
| `region_ids` | `[u8; N]` | Region ID for each hex, indexed identically to `hex_ids` |

**Size:** ~4,500 bytes (500 hexes × 9 bytes)

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

**Parameters:** `season_id`, `hex_id`, `adjacent_hex_id` (if required), `adjacency_chunk_index: u8` (if adjacency required), `initial_commitment: [u8; 32]`, `initial_nonce: u64`

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
- Verify initial_nonce == player.commitment_nonce
- Set hex.defence_commitment to initial_commitment
- Set hex.has_commitment to true
- Set hex.defence_nonce to initial_nonce
- Read region_id from valid_hex_set.region_ids at the same index used for hex validation (binary search index)
- Set hex.region_id = region_id
- Set player.commitment_nonce += 1
- Check if hex_id is in season.landmarks array — set is_landmark accordingly
- Increment player hex_count (and landmark_count if landmark)
- Update season_counters.total_hexes_claimed
- Emit `HexClaimed` event

**CU note:** `claim_hex` is the heaviest instruction and hits during the busiest period (Land Rush). Benchmark worst-case CU on devnet in Phase 1, Week 1. If it exceeds 150k CU, investigate splitting into two instructions. The Merkle proof removal (region_id now read from ValidHexSet) is the biggest CU win. Consider waiving adjacency for all Land Rush claims to further reduce account set during the busiest period.

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

**Parameters:** `season_id`, `hex_id`, `old_energy_amount: u32`, `old_blind: [u8; 32]`, `new_commitment: [u8; 32]`, `new_nonce: u64`, `new_energy_delta: u32` (fresh energy from `energy_balance` for new commitment)

**Logic:**
- Verify hex is owned by player and has a commitment
- Verify hex is not commitment_locked
- Verify new_nonce == player.commitment_nonce
- Verify Pedersen opening of old commitment
- Return old_energy_amount to player.energy_balance (capped at energy_cap)
- Deduct old_energy_amount from player.energy_committed
- Set new commitment and hex.defence_nonce to new_nonce
- Deduct new_energy_delta from player.energy_balance
- Add new_energy_delta to player.energy_committed
- Set player.commitment_nonce += 1
- Emit `DefenceRecommitted` event

**Security note:** The old energy amount is revealed in this transaction. The player is choosing to update their defence and accepting the information leakage. The new commitment remains hidden.

#### 3.3.10 `increase_defence`

**Purpose:** Reinforce a hex's defence without revealing the existing allocation. Add-only — the defence can only increase, not decrease.

**Accounts:** player_wallet (signer), season (read), player (mut), hex (mut)

**Parameters:** `season_id`, `hex_id`, `new_commitment: [u8; 32]` (new compressed Ristretto point reflecting the increased total), `new_nonce: u64`, `delta: u32` (must be > 0)

**Logic:**
- Verify season is in LandRush, War, EscalationStage1, or EscalationStage2 phase
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
- Check retaliation token: if player has valid token (retaliation_target matches defender, not expired), apply discount to min_attack_energy and energy cost. Consume token after attack creation.
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
- **Caller verification:** Verify caller is either the defender (`caller == attack.defender`) or the defender's registered guardian (`player_defender.guardian == Some(caller)`). If guardian, set `guardian_reveal = true` and emit `GuardianRevealSubmitted` event before combat resolution. If neither, reject with `NotAuthorisedToReveal`.
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
        - Add season.capture_bonus_points to player_attacker.points
        - If hex.region_id is in season.active_theatres and now < season.theatre_expires_at: add season.theatre_capture_bonus_points to player_attacker.points
    - If attack.energy_committed ≤ energy_amount: **Defender wins**
        - Hex remains with defender
        - Set hex.last_combat_resolved = now (triggers 4-hour recommit grace window)
        - Deduct energy_amount from defender's energy_committed (commitment consumed — see "Regardless of outcome" below)
        - Attacker loses all committed energy (already deducted at launch)
        - Update both players' stats
        - If hex.region_id is in season.active_theatres and now < season.theatre_expires_at: add season.theatre_defence_bonus_points to player_defender.points
        - If attack.energy_committed >= season.min_attack_energy * season.attack_refund_min_threshold_multiplier: calculate refund = attack.energy_committed × season.attack_refund_bps / 10000, add refund to player_attacker.energy_balance (capped at energy_cap), emit `AttackRefunded` event
        - Grant retaliation token: if defender already has token targeting same attacker, extend expiry; otherwise set retaliation_target, retaliation_expires, retaliation_discount_bps
- **Regardless of outcome:** The defence commitment is consumed and cleared after reveal. The revealed energy amount is deducted from the defender's `energy_committed`, the hex's `defence_commitment` is zeroed, and `has_commitment` is set to false. This is intentional — defending costs energy, even when successful.
- Set attack.resolved = true, set result
- Set hex.under_attack = false, hex.commitment_locked = false
- Set hex.defence_commitment to zeroes, has_commitment = false, defence_nonce = 0
- Close Attack account (reclaim rent to attacker)
- Recalculate points for both players (lazy update)
- If either player's recalculated score exceeds season.victory_threshold, emit `VictoryThresholdReached` event (actual season-ending state change deferred to `claim_victory`)
- **Clutch Defence check (manual reveals only):** If `!guardian_reveal` AND `attack.deadline - now <= season.clutch_window_seconds` AND defender wins: add `season.clutch_defence_bonus_points` to `player_defender.points`, increment `player_defender.clutch_defences`, emit `ClutchDefence` event.
- Emit `AttackResolved` event (includes `guardian_reveal: bool` field)

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
    - Add `season.phantom_recovery_energy` to defender's `phantom_energy` field for UI display
    - Update both players' hex_count, landmark_count, stats
    - If hex.region_id is in season.active_theatres and now < season.theatre_expires_at: add season.theatre_capture_bonus_points to player_attacker.points
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

**Note on phantom committed energy:** When a defender loses a hex by timeout, the energy they had committed to that hex remains locked in their `energy_committed` total. The `phantom_energy` field on the Player account tracks this for UI display (showing `energy_committed - phantom_energy` as "active" committed). The permissionless `clear_phantom_energy` instruction can zero out `energy_committed` when a player has no remaining hex commitments.

**Partial recovery (soft fail):** Phantom energy is not permanently lost. After a 24-hour delay, a player can call `recover_phantom_energy` to reclaim a flat recovery amount (`season.phantom_recovery_energy`, default 25 energy) for a specific lost hex. This is a deliberate soft penalty — the player loses time (24h where energy is locked) and receives a fixed consolation amount regardless of what was actually committed. This prevents the "feels like theft" experience that causes casual players to quit, while still meaningfully punishing inattentive defence. Recovery is limited to once per lost hex per season (tracked on-chain).

The flat recovery replaces an earlier average-based estimate (`energy_committed / hex_count`). The average was unreliable because defence allocations are intentionally non-uniform — a player with 200 energy on Paris and 10 on three other hexes would get a wildly wrong recovery either way. A flat amount is honest, predictable, and eliminates on-chain division arithmetic.

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

**Accounts:** any_signer, season (read), player (mut)

**Logic:**
- Verify season is active (not ended)
- **Fast path:** If `player.hex_count == 0` and `energy_committed > 0`: set `energy_committed = 0`, set `phantom_energy = 0`. This is correct because a player cannot have live commitments without owning hexes.
- If `player.hex_count > 0`: no change (partial cases cannot be resolved without revealing amounts)

#### 3.3.27 `recover_phantom_energy`

**Purpose:** Allow a player to reclaim a portion of phantom energy from a hex lost by timeout, after a 24-hour delay. Encourages continued play after a missed reveal rather than ragequitting.

**Accounts:** player_wallet (signer), season (read), player (mut), phantom_recovery (mut, close → rent to player)

**Parameters:** `season_id`, `hex_id`

**Logic:**
- Verify caller matches phantom_recovery.player
- Verify phantom_recovery.recovered is false
- Verify current time is at least 24 hours after phantom_recovery.lost_at (`now - lost_at >= 86400`)
- Recovery amount: `phantom_recovery.recovery_amount` (flat configurable amount, default 25)
- Add recovery amount to player.energy_balance (capped at energy_cap)
- Subtract recovery_amount from player.energy_committed
- Subtract recovery_amount from player.phantom_energy
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
| `recovery_amount` | `u32` | Flat recovery amount (from `season.phantom_recovery_energy`) |
| `lost_at` | `i64` | Timestamp of the timeout loss |
| `recovered` | `bool` | Whether recovery has been claimed |

**Size:** ~60 bytes

**Changes to `resolve_timeout` (3.3.13):** When a defender loses a hex with a commitment, create a PhantomRecovery account alongside the existing phantom_energy tracking. The `recovery_amount` is set to `season.phantom_recovery_energy` (default 25). This flat amount is honest — "you lost a hex by timeout, here's a flat consolation" — and doesn't pretend to know what was committed.

#### 3.3.28 `set_active_theatres`

**Purpose:** Admin sets or rotates the active theatre regions. Called by crank every 48 hours.

**Accounts:** admin (signer), season (mut)

**Parameters:** `season_id`, `theatre_regions: [u8; 3]`, `expires_at: i64`

**Logic:**
- Verify caller is admin
- Verify season is in War, EscalationStage1, or EscalationStage2 phase
- Verify no region_id in theatre_regions was in the previous season.active_theatres array (no consecutive repeats)
- Verify each non-zero region ID is in valid range (1–15)
- Verify expires_at > now (reject with TheatreWindowTooShort)
- Verify expires_at <= now + 176400 (reject with TheatreWindowTooLong)
- Set season.active_theatres, theatre_activated_at = now, theatre_expires_at = expires_at
- Increment season.theatre_window_index
- Emit `TheatreActivated` event

#### 3.3.29 `set_posture`

**Purpose:** Set public intent signal. Deferred feature.

**Accounts:** player_wallet (signer), season (read), player (mut)

**Parameters:** `season_id`, `posture_type: u8`, `posture_target: u64`, `posture_target_player: Option<Pubkey>`

**Logic:**
- Verify season is active
- Set player posture fields
- Set player.posture_expires = now + 86400
- Emit `PostureSet` event

#### 3.3.30 `set_guardian`

**Purpose:** Player registers a guardian delegate authorised to submit `reveal_defence` on their behalf.

**Accounts:** player_wallet (signer), season (read), player (mut)

**Parameters:** `season_id`, `guardian_pubkey: Pubkey`

**Logic:**
- Verify player is in this season
- Verify season has not ended
- Set player.guardian = Some(guardian_pubkey)
- Emit `GuardianSet` event

**No delay.** Unlike shield changes, enabling a guardian does not disadvantage opponents — it only allows someone else to reveal on the player's behalf.

#### 3.3.31 `clear_guardian`

**Purpose:** Player removes their guardian delegate.

**Accounts:** player_wallet (signer), season (read), player (mut)

**Parameters:** `season_id`

**Logic:**
- Verify player is in this season
- Set player.guardian = None
- Emit `GuardianCleared` event

### 3.4 Phase Transitions

Phase transitions are timestamp-based. The Season account stores the boundary timestamps and every instruction computes the effective phase from these timestamps:

```
fn effective_phase(season: &Season, now: i64) -> Phase {
    if season.actual_end.is_some() { return Phase::Ended; }
    if now >= season.season_end { return Phase::Ended; }
    if now >= season.escalation_stage_2_start { return Phase::EscalationStage2; }
    if now >= season.escalation_start { return Phase::EscalationStage1; }
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
| `AttackResolved` | season_id, attack_id, hex_id, attacker, defender, outcome, attacker_committed, defender_revealed, attacker_surplus_returned, attacker_refund, cooldown_end, guardian_reveal |
| `VictoryThresholdReached` | season_id, player, score |
| `PhantomEnergyRecovered` | season_id, player, hex_id, energy_recovered |
| `TheatreActivated` | season_id, theatre_regions, expires_at, capture_bonus_points, defence_bonus_points |
| `TheatreBonusAwarded` | season_id, player, hex_id, bonus_type (capture/defence), points |
| `AttackRefunded` | season_id, attack_id, player, refund_amount |
| `RetaliationTokenGranted` | season_id, player, target, expires_at, discount_bps |
| `RetaliationTokenUsed` | season_id, player, target, attack_id, discount_applied |
| `PostureSet` | season_id, player, posture_type, target, expires_at |
| `SeasonEnded` | season_id, end_reason |
| `SeasonFinalized` | season_id, winner, winning_score |
| `PhaseChanged` | season_id, new_phase, timestamp |
| `FinalizationProgress` | season_id, players_processed, current_leader |
| `HexAccountClosed` | season_id, hex_id, rent_returned_to |
| `PlayerAccountClosed` | season_id, player, rent_returned_to |
| `GuardianSet` | season_id, player, guardian_pubkey |
| `GuardianCleared` | season_id, player |
| `ClutchDefence` | season_id, player, hex_id, attack_id, bonus_points |
| `GuardianRevealSubmitted` | season_id, attack_id, hex_id, guardian_pubkey |

#### 3.5.1 Event Contract — `AttackResolved` Payload (v1.7.5 Requirement)

The `AttackResolved` event must include sufficient data for the frontend to render a complete battle report without additional RPC calls. This is a hard contract between the on-chain program, the indexer, and the frontend.

**Required fields:**

| Field | Type | Description |
|-------|------|-------------|
| `season_id` | u64 | Season identifier |
| `attack_id` | u64 | Unique attack identifier |
| `hex_id` | u64 | H3 index of the contested hex |
| `attacker` | Pubkey | Attacker wallet |
| `defender` | Pubkey | Defender wallet |
| `attacker_committed` | u32 | Energy committed by attacker at launch |
| `defender_revealed` | u32 | Energy revealed by defender (0 on timeout) |
| `outcome` | enum | `AttackerWins`, `DefenderWins`, `Timeout` |
| `attacker_surplus_returned` | u32 | Surplus energy returned to attacker (attacker wins only) |
| `attacker_refund` | u32 | Partial refund on loss (if above threshold, else 0) |
| `cooldown_end` | i64 | Unix timestamp when combat cooldown expires on this hex |
| `guardian_reveal` | bool | True if the reveal was submitted by the guardian service, false if manual or timeout |

**Note:** The existing `AttackResolved` event in the table above lists key fields in summary form. This section supersedes that with the complete required payload. The `AttackTimedOut` event is subsumed — timeouts are represented as `AttackResolved` with `outcome: Timeout` and `defender_revealed: 0`.

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
| `NotDefender` | `reveal_defence` | Caller is not the defender (deprecated — replaced by `NotAuthorisedToReveal`) |
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
| `MissingInitialCommitment` | `claim_hex` | No initial commitment provided |
| `InitialNonceMismatch` | `claim_hex` | initial_nonce does not match player.commitment_nonce |
| `InvalidRegionId` | `set_active_theatres` | Region ID not in valid range (1–15) |
| `SeasonNotInCombatPhase` | `set_active_theatres` | Season is in LandRush or Ended phase |
| `RetaliationTargetMismatch` | `launch_attack` | Retaliation token target does not match hex owner |
| `InvalidPostureType` | `set_posture` | posture_type not in valid range (0–3) |
| `PostureRequiresTarget` | `set_posture` | Mobilising or Fortifying without target |
| `StandingDownRequiresPlayer` | `set_posture` | StandingDown without target player |
| `TheatreWindowTooLong` | `set_active_theatres` | expires_at exceeds 49-hour maximum |
| `TheatreWindowTooShort` | `set_active_theatres` | expires_at is not in the future |
| `NotAuthorisedToReveal` | `reveal_defence` | Caller is neither hex owner nor registered guardian |

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

9. **Crank wallet monitoring:** Monitor crank wallet SOL balance. Alert admin via Telegram if below 0.1 SOL. Auto-estimate next 24h burn: count pending timeouts, active seasons, and expected finalization/cleanup volume. Log projected SOL cost daily. Alert if projected burn exceeds current balance. Estimated crank cost per season: ~0.05 SOL (based on ~1000 timeout resolutions + finalization + cleanup at 0.000005 SOL per tx + priority fees).

#### 4.3.3 Map Data Upload Service

At season creation time, the backend (or a standalone script) performs:

1. Generate all H3 hexes at the configured resolution within the geographic bounds
2. Classify each hex as land or water (using a geographic dataset or API)
3. Compute the adjacency edge set for all valid land hexes
4. Sort hex IDs and edge pairs for binary search
5. Assign each hex to a named region based on geographic centre coordinates
6. Upload hex data (hex IDs + region IDs) on-chain via `init_valid_hexes` + `append_hex_data` (chunked by transaction size)
7. Upload adjacency data via `init_adjacency` + `append_adjacency_data` (chunked)
8. Call `finalize_map_data` to lock the data and enable gameplay

#### 4.3.4 Bot Controller Service (Narrative Bots)

A backend service that runs alongside the crank, controlling NPC bot wallets. Bots serve as both population filler and narrative content generators.

**Core design:**
- Bots are real Solana wallets making real on-chain transactions
- Clearly labelled: distinct "BOT" tag on profile
- Server-side: bot secret seeds and defence allocations live on the backend
- Respond to attacks automatically within the countdown window (with randomised delay)

**Named factions:** Each bot represents a named historical faction with a defined personality and strategic goal:

| Faction Name | Archetype | Strategic Goal | Home Region |
|-------------|-----------|---------------|-------------|
| The Roman Legion | Expansionist | Control Italian Peninsula + expand toward Gallic Heartland | Italian Peninsula |
| Norse Raiders | Aggressor | Raid coastlines, never hold interior territory for long | Scandinavia |
| The Ottoman Empire | Turtle | Hold Anatolian Gate and expand into Balkans | Anatolian Gate |
| The Hanseatic League | Trader | Hold port cities (coastal landmarks) across northern Europe | Low Countries / Baltic |
| The Alpine Confederacy | Turtle | Fortify the Alpine Corridor, rarely attack | Alpine Corridor |

The faction list is configurable per season. 15–20 bots are active at season start. Faction names and goals are visible on player profiles.

**Announced goals:** At season start and periodically, the war feed announces bot faction goals: "The Ottoman Empire seeks to control the Balkans. Stand in their way — or let them march."

**Taunt lines:** When a bot attacks a human player's hex, the war feed includes a themed message from a pool of 10–15 lines per faction: "The Norse Raiders descend on [hex name]! The longships have arrived." When a bot defends successfully: "The Alpine Confederacy holds firm in [hex name]. The mountains do not yield."

**Incursion events:** Periodically (every 3–5 days), the bot controller triggers a coordinated incursion — a named faction launches 3–5 simultaneous attacks in a target region over a 2-hour window. The war feed announces the incursion 6 hours in advance. Players in the target region receive Telegram alerts. Defending against all incursion attacks earns a cosmetic badge.

**Scaling:**
- Start a season with 15–20 bots
- As human players join, gradually retire bots (stop reinforcing, get conquered naturally)
- If season hits 30+ humans, all bots can be eliminated through gameplay
- If it stays at 5 humans, bots keep the map alive

**Cryptographic integrity:** Bots use the same Pedersen commitment scheme as players. Their defence allocations are genuinely hidden.

**Implementation:** Bot controller as a separate Node.js module alongside the crank. Faction definitions, taunt line pools, and incursion scheduling stored in a JSON configuration file.

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

**Daily briefing (configurable time, default 08:00 in player's shield timezone):** A summary message sent once per day covering the previous 24 hours:

```
Solvasion Daily Briefing — Day 12

Your Territory: 23 hexes (+2) | 3 landmarks
Energy: 340 available | 180 committed
Points: 18,420 (Rank #4)

Overnight Activity:
  - You defended London against [Player]
  - [Player] captured Hamburg from [Player]
  - Norse Raiders lost 2 hexes in Scandinavia

Active Theatres: Balkans (31h remaining), Iberian Peninsula (31h remaining)

Watch:
  - [Player] expanded to 3 hexes adjacent to your territory in Central Europe
  - The Ottoman Empire is mobilising toward the Balkans

Season: Day 12 of 28 | Leader: [Player] (22,100 pts)
```

The crank generates briefing content from the backend database, aligned to 2 hours after each player's shield window ends.

#### 4.3.5.1 Notification Contract — `GuardianFailure` (v1.7.5 Requirement)

When the guardian auto-reveal service fails to reveal on behalf of a player, it must emit a `GuardianFailure` notification to both the WebSocket and Telegram channels. This is a hard contract between the guardian service, the backend, and the frontend.

**Trigger definition:** A guardian failure is declared when: the defender has guardian enabled AND an attack is pending AND any of the following are true:
- Guardian has no valid reveal packet for the hex
- Nonce mismatch between stored packet and on-chain hex state
- Reveal transaction submission fails after 3 retry attempts (exponential backoff: 5s, 30s, 2min)
- Guardian wallet has insufficient SOL to submit the transaction
- Guardian did not detect the attack in time (indexer lag exceeded `attack_deadline - retry_budget`)

Any of these conditions must cause the guardian service to emit a `GuardianFailure` notification. The frontend treats this as a boolean state per `attack_id` — it does not interpret or display the failure reason.

**Notification payload:**

| Field | Type | Description |
|-------|------|-------------|
| `attack_id` | u64 | The attack that the guardian failed to reveal for |
| `hex_id` | u64 | The hex under attack |
| `reason` | enum | `NoPacket`, `NonceMismatch`, `TxFailed`, `InsufficientSol`, `DetectionLag` |
| `timestamp` | i64 | Unix timestamp of the failure declaration |
| `deadline_uk_time` | string | Human-readable deadline in UK time (e.g., "14:32 UK time") |

**Transport:**
- **WebSocket:** Pushed to the player's client as a `guardian_failure` event. Frontend displays a red "Guardian Failed" badge on the attacked hex and surfaces the manual reveal CTA at the top of the Reveals Due screen.
- **Telegram:** Sent immediately with ⚠️ prefix: "⚠️ Guardian failed to reveal [hex name]. Deadline: [deadline_uk_time]. Reveal manually NOW. [deep link to reveal screen]"

**Retry behaviour:** The guardian retries up to 3 times with exponential backoff before declaring failure. It never silently gives up — every final failure produces a notification.

#### 4.3.6 Contracts and Bounties

Off-chain daily/weekly objectives with cosmetic rewards, providing short-term goals beyond "win the season." All tracking is handled by the backend.

**Daily contracts (2 per player, refresh every 24h):** Examples include "Claim 2 unowned hexes," "Successfully defend 1 attack," "Launch 1 attack," "Capture 1 enemy hex," "Commit or increase defence on 3 hexes."

**Weekly contracts (1 per player, refresh every 7 days):** Examples include "Hold a contiguous blob of 10+ hexes for 24h," "Launch 5 attacks in a week," "Successfully defend 3 attacks."

**Contract assignment:** Weighted toward actions the player has not recently taken, encouraging variety.

**Rewards:** Season XP (secondary score for "Most Active" badge), profile badges, and banner frames. Season XP does not affect the on-chain victory condition.

**Bounties:** Public objectives visible to all players. System-generated, 1–2 active at a time. Examples: "Capture [landmark] — 500 bonus season XP," "Repel the [faction] incursion — 300 bonus season XP," "Theatre domination — 1,000 season XP to the player holding the most hexes in [theatre region] when it expires."

#### 4.3.7 Guardian Service

The Guardian is a Node.js service running alongside the crank on the NUC. It maintains:
- A SQLite table of enrolled players: `(wallet, season_id, symmetric_key)`.
- A SQLite table of reveal packets: `(season_id, wallet, hex_id, encrypted_packet, packet_version, defence_nonce)`.
- A dedicated Solana keypair for submitting reveal transactions.

**Service loop:**

On `AttackLaunched` event where defender has Guardian enrolment:
1. Look up packet for `(season_id, defender_wallet, target_hex_id)`.
2. If no packet: send Telegram alert ("Guardian could not auto-reveal [hex] — no synced packet. Reveal manually. Deadline: [time]").
3. If packet exists: decrypt using stored symmetric key.
4. Sanity check: verify `packet.defence_nonce` matches on-chain hex `defence_nonce` via RPC query. If mismatch: alert player, do not reveal.
5. Submit `reveal_defence(energy_amount, opening_bytes)` signed by Guardian keypair.
6. On success: delete packet (commitment consumed regardless of combat outcome).
7. On failure: retry with exponential backoff (max 5 min). If all retries fail: alert player.

**Monitoring:**
- Guardian wallet SOL balance monitored alongside crank wallet (Section 4.3.2). Alert admin if below 0.05 SOL.
- Dashboard metric: "Guardian reveal success rate" (target: >99%).
- Log: packets stored, reveals submitted (success/fail), stale packets detected, sync failures.

**REST API endpoints (all require wallet signature authentication):**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/guardian/enrol` | POST | Register for Guardian. Body: `{ season_id, wallet, symmetric_key }`. Key is envelope-encrypted immediately on receipt. |
| `/api/guardian/unenrol` | POST | Remove Guardian enrolment. Deletes all packets and key. |
| `/api/guardian/packet` | PUT | Upload or replace a reveal packet. Body: `{ season_id, hex_id, encrypted_packet, packet_version, defence_nonce }`. |
| `/api/guardian/packet/:hexId` | DELETE | Remove a specific packet. |
| `/api/guardian/status/:wallet` | GET | Return sync status: list of enrolled hexes with packet_version and sync state. |

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
    guardian_enabled    BOOLEAN DEFAULT FALSE,
    clutch_defences     INTEGER DEFAULT 0,
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
    region_id           INTEGER,
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
    guardian_reveal      BOOLEAN DEFAULT FALSE,
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
    best_score          INTEGER,
    total_clutch_defences INTEGER DEFAULT 0
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
CREATE INDEX idx_hexes_region ON hexes(season_id, region_id);
CREATE INDEX idx_hexes_cleanup ON hexes(season_id, rent_returned) WHERE rent_returned = FALSE;
CREATE INDEX idx_players_cleanup ON players(season_id, rent_returned) WHERE rent_returned = FALSE;

CREATE TABLE regions (
    season_id           INTEGER NOT NULL,
    region_id           INTEGER NOT NULL,
    name                TEXT NOT NULL,
    hex_ids             TEXT NOT NULL,
    PRIMARY KEY (season_id, region_id)
);

CREATE TABLE theatres (
    theatre_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id               INTEGER NOT NULL,
    region_ids              TEXT NOT NULL,
    capture_bonus_points    INTEGER NOT NULL,
    defence_bonus_points    INTEGER NOT NULL,
    activated_at            INTEGER NOT NULL,
    expires_at              INTEGER NOT NULL
);

CREATE TABLE war_feed (
    feed_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id           INTEGER NOT NULL,
    event_type          TEXT NOT NULL,
    message             TEXT NOT NULL,
    involved_players    TEXT,
    hex_id              INTEGER,
    region_name         TEXT,
    created_at          INTEGER NOT NULL
);

CREATE TABLE contracts (
    contract_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id           INTEGER NOT NULL,
    wallet              TEXT NOT NULL,
    contract_type       TEXT NOT NULL,
    description         TEXT NOT NULL,
    assigned_at         INTEGER NOT NULL,
    expires_at          INTEGER NOT NULL,
    completed_at        INTEGER,
    reward_xp           INTEGER NOT NULL DEFAULT 100,
    reward_badge        TEXT
);

CREATE TABLE bounties (
    bounty_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id           INTEGER NOT NULL,
    description         TEXT NOT NULL,
    target_hex          INTEGER,
    target_region       TEXT,
    reward_xp           INTEGER NOT NULL,
    created_at          INTEGER NOT NULL,
    expires_at          INTEGER NOT NULL,
    completed_by        TEXT,
    completed_at        INTEGER
);

CREATE TABLE player_cosmetics (
    season_id           INTEGER NOT NULL,
    wallet              TEXT NOT NULL,
    season_xp           INTEGER DEFAULT 0,
    badges              TEXT DEFAULT '[]',
    banner_frame        TEXT,
    contracts_completed INTEGER DEFAULT 0,
    bounties_completed  INTEGER DEFAULT 0,
    clutch_defences     INTEGER DEFAULT 0,
    PRIMARY KEY (season_id, wallet)
);

CREATE TABLE bot_factions (
    season_id           INTEGER NOT NULL,
    faction_id          TEXT NOT NULL,
    faction_name        TEXT NOT NULL,
    archetype           TEXT NOT NULL,
    home_region         TEXT NOT NULL,
    strategic_goal      TEXT NOT NULL,
    active              BOOLEAN DEFAULT TRUE,
    wallet              TEXT NOT NULL,
    PRIMARY KEY (season_id, faction_id)
);

CREATE TABLE bot_incursions (
    incursion_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id           INTEGER NOT NULL,
    faction_id          TEXT NOT NULL,
    target_region       TEXT NOT NULL,
    announced_at        INTEGER NOT NULL,
    starts_at           INTEGER NOT NULL,
    attack_count        INTEGER NOT NULL DEFAULT 3,
    completed           BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_theatres_active ON theatres(season_id, expires_at) WHERE expires_at > 0;
CREATE INDEX idx_feed_season ON war_feed(season_id, created_at DESC);
CREATE INDEX idx_feed_player ON war_feed(season_id, involved_players);
CREATE INDEX idx_contracts_active ON contracts(season_id, wallet, expires_at) WHERE completed_at IS NULL;
CREATE INDEX idx_bounties_active ON bounties(season_id, expires_at) WHERE completed_at IS NULL;
CREATE INDEX idx_incursions_upcoming ON bot_incursions(season_id, starts_at) WHERE completed = FALSE;

-- Guardian service tables
CREATE TABLE guardian_enrolments (
    wallet              TEXT NOT NULL,
    season_id           INTEGER NOT NULL,
    symmetric_key       BLOB NOT NULL,
    enrolled_at         INTEGER NOT NULL,
    PRIMARY KEY (wallet, season_id)
);

CREATE TABLE guardian_packets (
    season_id           INTEGER NOT NULL,
    wallet              TEXT NOT NULL,
    hex_id              INTEGER NOT NULL,
    encrypted_packet    BLOB NOT NULL,
    packet_version      INTEGER NOT NULL DEFAULT 1,
    defence_nonce       INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    PRIMARY KEY (season_id, wallet, hex_id)
);

CREATE INDEX idx_guardian_packets_lookup
    ON guardian_packets(season_id, wallet, hex_id);

-- Guardian and Clutch Defence additions to existing tables
-- players: guardian_enabled BOOLEAN DEFAULT FALSE, clutch_defences INTEGER DEFAULT 0
-- attacks: guardian_reveal BOOLEAN DEFAULT FALSE
-- reputations: total_clutch_defences INTEGER DEFAULT 0
-- player_cosmetics: clutch_defences INTEGER DEFAULT 0
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
| `/api/seasons/:id/feed` | GET | Paginated war feed events. Supports `?filter=my_territory&since=timestamp` |
| `/api/seasons/:id/theatres` | GET | Active and upcoming theatre objectives |
| `/api/seasons/:id/regions` | GET | All named regions with hex assignments |
| `/api/seasons/:id/contracts/:wallet` | GET | Active and recently completed contracts for a player |
| `/api/seasons/:id/bounties` | GET | Active and recently completed bounties |
| `/api/seasons/:id/cosmetics/:wallet` | GET | Player's season XP, badges, and banner frame |
| `/api/seasons/:id/postures` | GET | Active postures for all players |

**Rate limiting:** All endpoints are rate-limited to 60 requests per minute per IP. The `/map` endpoint (which returns all ~500 hexes) is limited to 10 requests per minute per IP.

### 4.6 WebSocket Protocol

The backend exposes a WebSocket endpoint for real-time frontend updates.

**Connection:** `wss://api.solvasion.io/ws` (or configured host)

**Subscribe:** Client sends `{ "season_id": <id>, "wallet": "<optional>" }`. Wallet is optional (spectators omit it).

**Server push events:** Map updates, attack launches/resolutions, phase changes, leaderboard deltas, war feed entries, theatre changes.

**Cursor-based resume:** Every event includes a monotonic `event_id` (u64 cursor). On reconnect, the client sends `{ "resume_from": <last_event_id> }`. The server replays missed events or, if the gap is too large, responds with `{ "full_sync_required": true }` — the client then fetches full state from REST.

**Design principle:** WebSocket is real-time hints; REST is source of truth after reconnect. The client should never rely solely on WebSocket for state — on reconnect, always fetch full state from REST, then resume WebSocket for incremental updates.

**Keep-alive:** Server pings every 30 seconds, client responds with pong.

### 4.7 Resilience

The backend is a read cache only. If it crashes or produces incorrect data, no game state is affected. On restart, it reconciles from on-chain data.

The WebSocket connection may drop. The reconciliation crank (running every 2–3 minutes) catches any missed events.

The crank's timeout resolution, finalization, and account cleanup are conveniences, not requirements. Anyone can call the permissionless instructions directly.

#### Authoritative Rebuild Procedure

On-chain account state is the single source of truth, not event logs. Events are used for real-time updates only. A full rebuild reads all Season, Player, Hex, and Attack PDAs directly via `getProgramAccounts` and reconstructs the DB from their current state.

**Event deduplication:** Every event is processed idempotently. The indexer stores the last processed Solana slot + transaction signature. On reconnect, it re-fetches events from the last known slot. Duplicate signatures are skipped.

**Reorg handling:** The indexer only treats events from finalized (or at minimum confirmed) slots as authoritative. Optimistic UI updates can use processed-level confirmation but the DB waits for confirmed.

**Reconciliation as safety net:** The crank reconciliation loop (every 2–3 minutes) compares DB state against on-chain PDAs. Any drift is corrected from chain. Even if events are missed or duplicated, the reconciliation loop eventually corrects.

**Manual rebuild:** A "rebuild from chain" command drops and reconstructs the DB from PDA state. This is the nuclear option for unrecoverable drift.

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
- **Named regions:** The map is divided into named European regions (Section 2.8.2). Region names displayed as subtle labels at appropriate zoom levels. Region boundaries shown as thin dotted lines.
- **Active theatres:** Active theatre regions outlined with a pulsing gold border. Theatre info panel shows: region name, time remaining, multiplier, territorial breakdown by player.
- **Contested borders:** Hex edges where two different players share a border are highlighted with a thicker, brighter line. Immediately shows where conflict is likely.
- **Recently active zones:** Hexes involved in attacks within the last 24 hours have a subtle animated pulse. Intensity fades over 24 hours.
- **Threat indicators:** Hexes adjacent to the player's territory owned by someone who has recently attacked the player show a small warning icon.

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

##### 5.2.5.2 Post-Defence Recommit Flow

When a defender wins combat, their defence commitment is consumed (Section 2.5.8). The following UX drives prompt recommitment:

- **On defender win:** Modal/toast: "Defence consumed. You are protected for [countdown]. Recommit now." Single button opens defence panel pre-focused on that hex.
- **Telegram notification:** Sent immediately. Includes hex name, cooldown expiry (absolute time in player's timezone), deep link to recommit screen.
- **Follow-up notification:** At 75% of cooldown (3h into 4h window): "[hex] cooldown expires in 1 hour. Recommit now or it will be vulnerable."
- **Map indicator:** Uncommitted hex shows "protected" state during cooldown (shield icon + countdown), transitions to "vulnerable" state (warning icon) after cooldown expires.
- **One-click "Recommit same amount":** Client knows the revealed amount from the defence ledger. Pre-fills recommit panel with previous amount. Single tap to resubmit. Player can adjust before confirming. This makes "defence consumed" feel like manageable upkeep, not punishment.
- **Daily briefing:** "X hexes have no active defence commitment."

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

#### 5.2.8 War Feed

A scrolling event log displayed in a collapsible sidebar panel (or overlay on mobile). Shows recent game events as narrative text, using named regions and player names.

**Feed events:**

| Event Source | Feed Message Format |
|-------------|-------------------|
| `HexClaimed` | "[Player] claimed [hex name] in [region]." |
| `AttackLaunched` | "[Attacker] attacks [Defender]'s [hex name] with [energy] energy! Deadline: [time]." |
| `AttackResolved` (attacker wins) | "[Attacker] captured [hex name] from [Defender]! The [region] shifts." |
| `AttackResolved` (defender wins) | "[Defender] held [hex name] against [Attacker]'s assault." |
| `AttackTimedOut` | "[Attacker] took [hex name] by default — [Defender] failed to respond." |
| `DefenceIncreased` | "[Player] reinforced [hex name] (+[delta] energy)." |
| Theatre activation | "Theatre Alert: [region 1] and [region 2] are now active theatres! 2× points for 48 hours." |
| Bot incursion | "[Faction name] descend on [hex name]! [Taunt line]" |
| Phase change | "The War Phase has begun." / "Escalation Stage 2 activates!" |
| Victory proximity | "[Player] is approaching victory! [score] / [threshold] points." |
| `ClutchDefence` | "Clutch Defence! [Player] held [hex name] in the final hour. +12" |
| `AttackResolved` (guardian) | "[Defender]'s Guardian auto-revealed [hex name]. [Result]." |

**Feed filtering:** All events (default), My territory, Region, or Player filters.

**Implementation:** Backend maintains feed as ordered event list in database. Frontend polls `/api/seasons/:id/feed` or receives WebSocket updates.

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
2. **Cloud backup (resilient, default on):** An encrypted JSON blob stored in wallet-linked cloud storage (e.g. a signed, encrypted payload pushed to a simple backend endpoint or IPFS). The blob is encrypted with a key derived from the season seed itself, so the server never sees plaintext. Updated automatically on every defence operation (debounced to avoid excessive writes). Cloud sync is enabled by default for all players. Players can disable this in settings.

**Backup prompt:** After initial seed derivation, the client displays a persistent banner: "Back up your defence data to avoid losing access on other devices." The banner includes:
- A "Copy Seed" button (copies the hex-encoded seed to clipboard)
- A "Download Backup" button (exports seed + current defence ledger as an encrypted JSON file, encrypted with a user-provided passphrase)
- Cloud sync status indicator (enabled by default; "Disable Cloud Sync" option in settings)
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

### 5.6 v1.7.5 UX Addendum — Player Experience Pre-Mortem

This addendum defines player-facing UX requirements derived from a structured pre-mortem analysis. It identifies the top ways players rage-quit and specifies the exact guardrails (UI + rules) to prevent each one. All acceptance criteria are testable and map to specific spec sections, backend payloads, and UI states.

The hard data contracts required by this addendum (AttackResolved payload, GuardianFailure notification) are defined in Sections 3.5.1 and 4.3.5.1 respectively.

#### 5.6.1 How This Document Works

Each rage-quit scenario is assessed against the current spec (v1.7.4) and the pre-build review. Items are tagged:

- **✅ Already specified** — exists in spec or review doc, just needs building
- **🔧 Needs spec addition** — new requirement for v1.7.5 UX addendum
- **📋 Frontend-only** — no spec change needed, pure UI/UX implementation work
- **🔮 Defer to v2** — good idea, not MVP

The final section distils everything into three "non-negotiable" MVP features with acceptance criteria.

#### 5.6.2 Rage-Quit Scenarios

**1. "I lost because I forgot to reveal. That's dumb."**

The single most likely churn event. Commitment systems punish forgetfulness more than strategy if the UX isn't relentless.

**What's already in the spec:**

- ✅ Countdown badge on attacked hexes with colour progression: green → yellow → red → flashing red (5.2.5.1)
- ✅ Persistent attack alert banner linking to prefilled reveal screen (5.2.5.1)
- ✅ One-tap reveal screen: shows hex, attacker energy, player's committed defence, single "Reveal and Defend" button (5.2.5.1)
- ✅ Telegram notifications at attack launch, 50% countdown, 1h remaining, 15min remaining (5.2.5.1)
- ✅ Phantom recovery: 50% energy recovery after 24h delay for timeout losses (3.3.27, updated to flat amount per pre-build review 1.4)

**What's new — add to spec:**

- 🔧 **"Reveals Due" screen (batch reveal).** A dedicated screen (accessible from the Orders panel and as auto-open on app load) showing ALL hexes currently under attack with countdowns, sorted by urgency. Each row shows: hex name, attacker energy, player's committed garrison, countdown, deadline as absolute time (UK time), and a "Reveal" button. At the top: a "Reveal All" button that submits sequential transactions (one per hex, since each requires a separate Pedersen opening). The wallet may prompt per transaction depending on wallet adapter; the UI must keep the player in one continuous batch flow with progress indicator ("Revealing 2 of 3..."). If any reveal fails, the batch pauses on that hex and offers Retry / Skip / Cancel Batch — never leaves the player in a half-completed state.

  **Auto-open rule:** The Reveals Due modal opens on app load if: (A) any reveal has less than 3 hours remaining, OR (B) the player has not seen the modal since the last app session AND at least one reveal is pending. This avoids nagging on every load while still protecting forgetful players. The client stores a `last_seen_reveals_modal` timestamp locally.

- 🔧 **Clear copy on timeout consequences.** Everywhere a countdown appears, include the subtext: "If you don't reveal, your garrison is treated as 0 and you lose the hex." This must appear in: the attack alert banner, the Reveals Due screen, and every Telegram notification. Every Telegram notification must also include the absolute deadline time in UK time (e.g., "Reveal by 14:32 UK time"), hex name, and attacker energy.

- 🔮 **Grace reveal (defer to v2).** A one-time-per-season "emergency defend" that allows a player to reveal after the deadline has passed, at a steep energy cost (e.g., 2× the committed amount deducted from energy_balance). Burns a limited resource (one per season) to save casuals without being exploitable by grinders. This requires an on-chain instruction and is not MVP, but worth noting in Section 10.2 (Future Features) as a retention tool.

**Acceptance criteria (MVP):**

1. On app load matching auto-open rule (reveal <3h away, or first session with pending reveals): modal shell appears immediately; reveal list populates within 1s from local data or within 3s from WebSocket/RPC fetch.
2. "Reveal All" submits sequential transactions. Wallet prompts may appear per tx. UI shows progress ("Revealing 2 of 3..."). If any tx fails, batch pauses on that hex with Retry / Skip / Cancel. No double reveals; timers continue updating during batch.
3. Every Telegram notification includes: hex name, attacker energy, deadline as absolute UK time ("Reveal by 14:32 UK time"), and "If you don't reveal, your garrison is treated as 0."
4. Countdown badge visible on map at all zoom levels where the hex is visible.
5. **Smoke test:** 3 simultaneous attacks; one reveal tx fails once due to RPC; player retries and completes all 3; no double reveals; timers updated throughout.
6. Each reveal row becomes disabled once a tx is in-flight or confirmed. Batch flow is idempotent: uses `attack_id` to ensure a revealed attack is never re-submitted. Prevents spam-click double-spend.

---

**2. "I revealed and my defence got 'consumed' — why would I ever defend?"**

Players expect defence to be a permanent wall. The spec's model (defence is a spendable resource, consumed on reveal) is correct game design but will confuse new players unless framed properly.

**What's already in the spec / review:**

- ✅ Defence Lifecycle section (new 2.5.8, from pre-build review 1.3) explains the consume-and-recommit cycle
- ✅ Post-defence recommit flow with one-click "Recommit same amount" (pre-build review 1.3, Section 5.2.5.2)
- ✅ 4-hour defender-win cooldown as recommit grace window (pre-build review 1.3)

**What's new — add to spec:**

- 🔧 **Naming: "Garrison" instead of "Defence" in all player-facing UI.** The word "defence" implies permanence. "Garrison" implies troops stationed at a position — spendable, replaceable. All UI copy, tooltips, notifications, and the war feed should use "garrison" for the per-hex committed energy. The on-chain field names remain `defence_commitment` etc. (no program change), but every frontend string uses "garrison."

  Examples:
  - "Commit garrison" not "Commit defence"
  - "Your garrison was spent in battle. Recommit now."
  - "Garrison: 30 energy committed to this hex"

- 🔧 **Battle results breakdown.** After any combat resolution (reveal or timeout), the hex action panel and the war feed show a visual breakdown:

  ```
  ┌─────────────────────────────────────┐
  │  BATTLE REPORT: London              │
  │                                     │
  │  Your garrison:    30 energy        │
  │  Attacker committed: 25 energy      │
  │  Result: YOU WIN ✓                  │
  │                                     │
  │  Garrison spent:   30 energy        │
  │  Garrison remaining: 0 (recommit!)  │
  │  Attacker lost:    25 energy        │
  │  Cooldown:         3h 42m remaining │
  │                                     │
  │  [Recommit Garrison]  [Dismiss]     │
  └─────────────────────────────────────┘
  ```

  On attacker wins:
  ```
  ┌──────────────────────────────────────────┐
  │  BATTLE REPORT: Paris                    │
  │                                          │
  │  Defender garrison: 20 energy            │
  │  Your attack:       35 energy            │
  │  Result: YOU CAPTURED ✓                  │
  │                                          │
  │  Surplus returned:  15 energy (immediate)│
  │  Hex is now yours.                       │
  │                                          │
  │  [Garrison This Hex]  [Dismiss]          │
  └──────────────────────────────────────────┘
  ```

  On timeout:
  ```
  ┌─────────────────────────────────────┐
  │  BATTLE REPORT: Berlin              │
  │                                     │
  │  Defender did not reveal.           │
  │  Your attack:       40 energy       │
  │  Result: CAPTURED BY DEFAULT        │
  │                                     │
  │  Energy cost:       10 (minimum)    │
  │  Energy returned:   30              │
  │                                     │
  │  [Garrison This Hex]  [Dismiss]     │
  └─────────────────────────────────────┘
  ```

- 📋 **First-time tooltip.** On the player's first `increase_defence` action, show a one-time tooltip: "Garrison is like ammunition — it's spent when you fight. After each battle, recommit to reload." Dismissible, stored in localStorage. No spec change needed, pure frontend.

**Acceptance criteria (MVP):**

1. Every combat resolution (reveal or timeout) shows a battle report with both sides' numbers and the outcome logic.
2. Defender-win report includes "Garrison remaining: 0 (recommit!)" to make consumption explicit.
3. Battle report includes a "Recommit Garrison" or "Garrison This Hex" CTA.
4. All player-facing text uses "garrison" not "defence" for per-hex energy commitments.
5. First-time tooltip appears on first garrison action.
6. Battle reports are retrievable from attack history by `attack_id`. Stored data includes: `attacker_committed`, `defender_revealed` (or 0 on timeout), outcome enum, refunds/returns, `cooldown_end`, and `guardian_reveal` flag.
7. Battle report displays "Revealed by: Manual" or "Revealed by: Guardian" when the defender revealed (not shown on timeout).
8. **Smoke test:** Timeout capture report shows "Defender did not reveal" prominently, includes default-win and refund maths. Defender sees the same report and understands why they lost.

---

**3. "I got attacked and it felt random / unfair."**

Fog-of-war mechanics can feel like coin flips unless the game shows *why* things happened and gives attackers a sense of risk assessment.

**What's already in the spec:**

- ✅ War feed shows attacks, captures, defences with named hexes and regions (5.2.8)
- ✅ Attack energy is publicly visible when launched (2.4.1)
- ✅ `increase_defence` delta is visible, building a public lower bound (2.5.4)

**What's new — add to spec:**

- 🔧 **Risk preview for attackers.** When a player selects an enemy hex to attack, the attack panel shows a risk assessment based exclusively on hard public signals (no inference, no speculative heuristics):

  - "Garrison status: Committed" (`has_commitment == true`) or "No garrison" (`has_commitment == false`)
  - "Known reinforcements: +30 energy observed" (sum of visible `increase_defence` deltas from war feed for this hex)
  - "Last defended: 2 days ago, revealed 45 energy" (from war feed history, if available)
  - "Last attacked/defended: 3 days ago" (recency of any combat on this hex)

  Risk label uses only the above signals with a simple, explainable rule (tooltip: "Based on public history only"):
  - **None** — `has_commitment == false`
  - **Unknown** — committed, no public reinforcement or reveal history
  - **Low** — last revealed value known and low relative to min attack energy
  - **High** — significant reinforcement deltas observed

  Deliberately excludes "owner's overall committed energy ratio" or any speculative inference — these create false confidence and player outrage when wrong.

- 🔮 **Tutorial battle (defer to v2).** A simulated attack/defend cycle during onboarding that teaches the commit → attack → reveal → outcome → recommit loop with fake energy and a bot opponent. Complex to build, high impact for retention, but not MVP.

**Acceptance criteria (MVP):**

1. Attack panel shows garrison status (committed / not committed) and known reinforcement history for the target hex.
2. Every battle report (from #2 above) shows both sides' numbers, not just the outcome.

---

**4. "Whales / grinders dominate. I can't catch up."**

On-chain games snowball unless there are visible catch-up paths.

**What's already in the spec:**

- ✅ Energy cap (500) prevents extreme hoarding (2.3.4)
- ✅ Escalation phases reduce attack costs and increase energy income (2.2.1)
- ✅ Theatre bonuses reward aggression in specific regions (2.8)
- ✅ Landmark decisiveness in Stage 2 creates high-value targets (2.2.1)
- ✅ Perimeter scaling means more territory = thinner defence (2.3.4)

**What's new — add to spec:**

- ✅ **"Opportunity Radar" — folded into Orders Panel (Section 8, item #5.2.9).** The opportunity items (active theatres, weakly held landmarks, ungarrisoned adjacent hexes, recent nearby battles) are sections 3–5 of the Orders panel. No separate UI component in v1. This avoids two half-finished features.

- 🔮 **Anti-snowball tuning knobs (defer to v2).** Consider for Season 2+: escalating energy cost to hold landmarks beyond N (e.g., landmarks 1–3 normal, landmarks 4–5 cost 2× maintenance energy), or diminishing point returns beyond a territory threshold. These are tuning levers, not structural changes — the Season parameter system already supports them. Note in 10.2.

**Acceptance criteria (MVP):**

1. Sidebar includes an "Opportunities" section showing at least: active theatres with countdown, and hexes adjacent to player territory with no garrison.

---

**5. "Bots / multi-wallets are everywhere."**

**What's already in the spec / review:**

- ✅ Active defence requirement makes multi-wallet management genuinely burdensome (Section 8)
- ✅ Energy cap prevents compounding (Section 8)
- ✅ Pre-build review 3.3: backend tracks "same funding wallet" patterns
- ✅ Pre-build review 3.3: refundable deposit as future friction

**What's new — add to spec:**

- 🔧 **Transparency leaderboard columns.** The leaderboard (5.2.6) should include columns or filters for: total hexes, total attacks launched, reveal consistency (% of attacks defended vs timed out), and account age (joined_at). This surfaces suspicious patterns (accounts with many hexes but 0% reveal rate, or accounts created on the same day) without requiring KYC.

- 📋 **Multi-wallet labour as deterrent.** No spec change needed — the existing commit/reveal mechanics already make multi-wallet play burdensome. The key is NOT to add quality-of-life features that accidentally make multi-wallet easier (e.g., don't add "manage all accounts from one dashboard").

**Acceptance criteria (MVP):**

1. Leaderboard shows reveal consistency (defences made / attacks received) as a visible column.

---

**6. "The backend glitched and my state was wrong."**

**What's already in the spec / review:**

- ✅ Pre-build review 2.11: indexer/backfill correctness, rebuild-from-chain procedure
- ✅ Backend is a read cache — on-chain state is authoritative (4.1, 4.6)
- ✅ Reconciliation crank catches drift every 2–3 minutes (4.3.2)

**What's new — add to spec:**

- 🔧 **"Verified on-chain" indicator.** Every data-displaying screen shows a small "Last synced: slot #X, Ys ago" indicator in the footer or status bar. If the indexer is more than 5 minutes behind, show: "Index catching up — chain is source of truth. [Refresh from chain]". The "Refresh from chain" button triggers a direct RPC fetch of the player's accounts and rebuilds local state.

- 🔧 **Public status page.** A simple status page (e.g., status.solvasion.io) showing: indexer lag (seconds behind tip), RPC health (latency + error rate), crank last run time, and active season summary. Built from the crank's own monitoring data.

**Acceptance criteria (MVP):**

1. "Last synced" indicator visible on main game screen.
2. "Refresh from chain" button available when indexer lag exceeds 5 minutes.

---

**7. "Transactions fail / fees / wallets are painful."**

**What's already in the spec:**

- ✅ `commit_defence` batches up to 21 commitments per transaction (6.6)
- ✅ Error handling with clear states and retry option (5.3)
- ✅ Player cost model showing minimal net costs (6.5)

**What's new — add to spec:**

- 🔧 **Pre-flight transaction simulation.** Before prompting wallet signature on any transaction, the frontend runs `simulateTransaction` and shows: estimated compute units, estimated fee, and any predicted errors. If simulation fails, show the error *before* the player signs (not after). This catches: insufficient energy, hex under attack, cooldown active, and CU budget issues before they become failed transactions.

- 🔧 **Retry with increased CU.** On transaction failure due to compute budget exceeded, show: "Transaction failed (compute limit). [Retry with higher limit]" — the retry button resubmits with `requestUnits(400_000)` instead of default.

- 📋 **Batch reveal (from #1).** Already covered above. Signing frequency stays low because reveals are the only time-pressured action, and batching keeps it to one signing session.

**Acceptance criteria (MVP):**

1. Every transaction is simulated before signing. Predicted failures show the error to the player without prompting wallet.
2. On compute budget failure, "Retry with higher limit" button is available.

---

**8. "I don't know what to do next."**

The single biggest UX gap in the current spec. Sandbox games need direction. The spec describes many features (theatres, landmarks, contracts, bounties) but no central place that tells the player "here's what to do right now."

**What's already in the spec:**

- ✅ Sidebar shows stats, leaderboard, active attacks (5.2.2)
- ✅ Contracts and bounties provide daily/weekly objectives (4.3.6)
- ✅ War feed shows recent events (5.2.8)

**What's new — add to spec:**

- 🔧 **"Orders" panel.** A single, always-accessible panel (top of sidebar or dedicated tab) that shows the player's prioritised action list. Items sorted by urgency:

  1. **Reveals due** — hexes under attack with countdowns. Red if < 1h. Links to Reveals Due screen.
  2. **Garrisons to recommit** — hexes with `has_commitment == false` (post-combat or post-withdrawal). Shows cooldown remaining if protected. Links to garrison panel.
  3. **Active theatres** — current theatre regions with time remaining and "X of your hexes are in this theatre." Links to theatre region on map.
  4. **Landmarks at risk** — landmarks adjacent to enemy territory or recently attacked. Links to landmark on map.
  5. **Suggested targets** — 2–3 enemy hexes adjacent to player territory, sorted by opportunity (no garrison > recently defended > unknown), with risk tier label (Low / Medium / High / Unknown). Links to hex on map.
  6. **Daily contract progress** — "Attack 1 hex: 0/1. Defend 1 hex: 1/1." Links to contracts screen.

  The panel updates in real-time via WebSocket. Empty states show encouraging copy: "All clear — expand your territory or reinforce your borders."

  The Orders panel replaces the need for players to mentally synthesise information from the sidebar, war feed, map, and notifications. It's the "what should I do?" answer.

**Acceptance criteria (MVP):**

1. Orders panel is visible on the main game screen without scrolling or navigating.
2. Reveals due appear at the top with countdown and direct link to reveal action.
3. At least 3 of the 6 item types are populated during active gameplay.
4. Panel updates within 5 seconds of relevant on-chain events (via WebSocket).

---

**9. "Endgame drags / stalemates / no climax."**

**What's already in the spec / review:**

- ✅ Two-stage escalation with landmark decisiveness (2.2.1)
- ✅ Pre-build review 3.6: 4+ day Stage 2, 10+ landmarks across 5+ regions
- ✅ Victory threshold with early victory mechanic (2.6.2)
- ✅ War feed announces phase changes and victory proximity (5.2.8)

**What's new — add to spec:**

- 🔧 **Escalation visibility.** The main game screen must show escalation status prominently (not buried in sidebar):

  - **Pre-escalation:** "Escalation in X days. Energy income and attack costs will change."
  - **Stage 1:** Banner: "ESCALATION STAGE 1 — Energy ×1.5, Attack cost ×0.85. Stage 2 in X days."
  - **Stage 2:** Prominent banner: "ESCALATION STAGE 2 — Landmarks worth 25 pts/hr. The endgame is here."
  - **Victory proximity:** When any player exceeds 80% of victory threshold: persistent alert: "[Player] at 42,000/50,000 points. [View their territory]"

- 🔧 **Landmark control dashboard.** A dedicated view (or section of the leaderboard) showing all landmarks, current holders, and projected impact:

  - "If [Player] holds Paris, London, Berlin for 2 more days, they win."
  - "Contesting any one of these landmarks delays victory by ~X hours."

  This turns the endgame from abstract point accumulation into a concrete, legible narrative.

**Acceptance criteria (MVP):**

1. Escalation stage banner is visible on the main game screen during Stage 1 and Stage 2.
2. Victory proximity alert appears when any player exceeds 80% of threshold.
3. Landmark holders are visible on the leaderboard or a dedicated landmarks view.

---

**10. "The meta is solved; newcomers are target practice."**

This is a Season 2+ concern. The first season IS the meta discovery period.

**What's already in the spec:**

- ✅ Season parameters are configurable (all energy rates, multipliers, thresholds)
- ✅ Map resolution is configurable per season (2.1)
- ✅ Theatre rotation creates shifting focal points (2.8)
- ✅ Bot factions provide varied opposition (4.3.4)

**What's new — note for future:**

- 🔮 **Seasonal parameter changelog.** For Season 2+, publish a "Season X Changes" document before each season: adjusted energy rates, new landmark positions, modified theatre bonus values. Public, not arbitrary. This signals that the meta intentionally evolves.

- 🔮 **Newcomer-friendly theatre design.** Design some theatre events that reward "first capture in theatre" or "smallest empire captures a theatre hex" — opportunities where being small is an advantage, not a handicap.

- 🔮 **Map layout variation.** Different geographic regions or resolutions per season. The H3 system supports this natively.

**Acceptance criteria (MVP):**

None for v1. Track for Season 2.

---

**11. "Guardian was enabled but it didn't reveal and I still lost."**

The most emotionally explosive failure mode. Players who set up auto-reveal (guardian) and still lose a hex to timeout will feel the system scammed them. This must be handled explicitly because the narrative will be "the game is broken" not "my reveal failed."

**What's already in the spec:**

- ✅ Guardian/auto-reveal system described in spec (5.2.5.1, backend guardian service)
- ✅ Guardian reveal is a backend service that submits reveal transactions on behalf of the player when they're offline

**What's new — add to spec:**

- 🔧 **Guardian failure UX.** When the guardian service declares a failure, the system must:

  **Trigger definition:** A "guardian failure" is declared when: the defender has guardian enabled AND an attack is pending AND any of the following are true: (a) guardian has no valid reveal packet for this hex, (b) nonce mismatch between packet and on-chain hex state, (c) reveal transaction submission fails after all retries, (d) guardian wallet has insufficient SOL to submit, or (e) guardian never detected the attack (indexer lag > attack deadline minus retry budget). Any of these states must cause the backend to emit a `GuardianFailure` notification to the client (via WebSocket) and to Telegram. The frontend treats `GuardianFailure` as a boolean state per attack_id — it does not try to determine failure reasons itself.

  1. **Immediately send a Telegram alert:** "⚠️ Guardian failed to reveal [hex]. Deadline: [absolute UK time]. Reveal manually NOW. [Open Game]" — distinct formatting from normal alerts (use ⚠️ prefix, different from standard attack notifications).
  2. **Show a red "Guardian Failed" badge on the attacked hex** in the UI, visible at all zoom levels. This replaces the normal attack countdown indicator.
  3. **Surface manual reveal CTA immediately** — the Reveals Due screen should show guardian-failed hexes at the very top with a red highlight and "Manual reveal required" label.
  4. **Log the failure** in the backend with: hex_id, attack_id, failure reason, timestamp, retry count. Surface guardian reliability stats to the player: "Guardian: 47/48 reveals successful (98%)."
  5. **Retry logic:** Guardian should retry failed reveals up to 3 times with exponential backoff (5s, 30s, 2min). If all retries fail, escalate to Telegram alert. Never silently give up.

- 🔧 **`AttackResolved` event must include `guardian_reveal` flag.** The event payload needs a boolean indicating whether the reveal was submitted by the guardian service vs the player directly. This allows the battle report to show "Revealed by guardian" and the failure flow to distinguish "guardian tried and failed" from "player never set up guardian."

**Acceptance criteria (MVP):**

1. When guardian fails to reveal, Telegram alert sent within 60 seconds of failure with ⚠️ prefix, hex name, and absolute deadline.
2. "Guardian Failed" red badge visible on the attacked hex in-app.
3. Reveals Due screen shows guardian-failed hexes at top with red highlight.
4. Guardian retries up to 3 times before escalating.
5. **Smoke test:** Guardian service is temporarily unable to reach RPC. Player has one attack pending with guardian enabled. Guardian fails 3 times, sends Telegram alert, player opens app and sees red badge, completes manual reveal successfully.

#### 5.6.3 MVP Non-Negotiables

If the frontend ships with nothing else beyond basic game mechanics, it must ship with these three features. They address the three most likely churn events and together stop an estimated 80% of preventable rage-quits.

**Non-Negotiable 1: Reveals Due Screen + Batch Reveal + Reminders**

**What it is:** A dedicated screen showing all hexes under attack, sorted by deadline urgency, with one-tap reveal per hex and a "Reveal All" batch button. Auto-opens on app load when reveals are pending. Backed by Telegram reminders at escalating urgency.

**Why it's non-negotiable:** The entire game depends on players revealing within a 6–12 hour window. If the UX doesn't make this effortless, every timeout feels like the game's fault, not the player's choice. Timeout churn is the #1 killer of commitment-based games.

**Acceptance criteria:**
1. Screen exists and is accessible from Orders panel and main navigation
2. Auto-opens on app load per rule: (A) any reveal <3h remaining, or (B) first session with pending reveals
3. Each row: hex name, attacker energy, player's garrison, countdown, absolute deadline (UK time), [Reveal] button
4. "Reveal All" submits sequential transactions. If any tx fails: Retry / Skip / Cancel. Progress indicator throughout. No double reveals.
5. Telegram notifications at: attack launch, 50% countdown, 1h, 15min. Each includes hex name, attacker energy, absolute deadline (UK time).
6. Every notification includes "garrison treated as 0 if not revealed"
7. **Smoke test:** 3 simultaneous attacks, one reveal tx fails once due to RPC; player retries and completes; no double reveals; timers continue updating during batch.

**Non-Negotiable 2: Battle Report Clarity**

**What it is:** After every combat resolution, a clear visual breakdown showing: both sides' energy, the outcome, what was spent, what was returned, and a CTA for the next action (recommit / garrison new hex).

**Why it's non-negotiable:** Without this, players don't understand why they won or lost, what the "consumed" garrison means, or what to do next. The battle report is where players learn the game's core loop. If it's opaque, they never build the mental model needed to play strategically.

**Acceptance criteria:**
1. Battle report appears after every `reveal_defence` and `resolve_timeout`
2. Shows: attacker energy, defender garrison, outcome, energy spent/returned for both sides
3. Defender-win report includes "Garrison remaining: 0 (recommit!)"
4. Includes CTA: "Recommit Garrison" (on defender win) or "Garrison This Hex" (on capture)
5. Retrievable from attack history via `attack_id`. Stored payload includes: `attacker_committed`, `defender_revealed`, outcome enum, refunds, `cooldown_end`, `guardian_reveal` flag.
6. Displays "Revealed by: Manual" or "Revealed by: Guardian" when defender revealed (not shown on timeout).
7. Uses "garrison" terminology throughout
8. **Smoke test:** Timeout capture report shows "Defender did not reveal", includes default-win logic and refund maths; defender sees the same report and understands why they lost.

**Non-Negotiable 3: Orders Panel**

**What it is:** A persistent, always-visible panel on the main game screen that tells the player exactly what to do next, prioritised by urgency: reveals due, garrisons to recommit, theatres to contest, landmarks at risk, suggested targets, daily contract progress.

**Why it's non-negotiable:** Solvasion is an async game where players check in a few times a day. Each session needs to start with a clear answer to "what happened while I was away, and what should I do now?" Without this, players open the map, see a hex grid, feel overwhelmed, and close the app. The Orders panel is the difference between "I don't know what to do" and "I have 3 things to do and 20 minutes to do them."

**Acceptance criteria:**
1. Visible on main game screen without navigation
2. Items sorted by urgency (reveals > recommits > theatres > landmarks > targets > contracts)
3. Each item links directly to the relevant action screen
4. Updates in real-time via WebSocket
5. Empty state: encouraging copy, not blank space
6. **Smoke test:** Player logs in after 12h offline. Panel lists: (1) 2 reveals due with countdowns, (2) 1 garrison to recommit, (3) 1 active theatre. Clicking each navigates to the correct action screen.

#### 5.6.4 Summary of New Spec Additions

| # | Addition | Spec Section | Priority |
|---|----------|-------------|----------|
| 1 | Reveals Due screen + batch reveal (with retry/skip/cancel) | 5.2.5.3 (new) | Non-negotiable |
| 2 | "Garrison" terminology throughout UI | 5.1 or 5.2 (note) | Non-negotiable |
| 3 | Battle report breakdown (with "garrison remaining: 0") | 5.2.5.3 (new) | Non-negotiable |
| 4 | Orders panel (includes opportunity radar items) | 5.2.9 (new) | Non-negotiable |
| 5 | Risk preview for attackers (hard public signals only) | 5.2.3 (expand) | MVP |
| 6 | ~~Opportunity Radar~~ → folded into Orders panel | — | — |
| 7 | Pre-flight transaction simulation | 5.3 (expand) | MVP |
| 8 | Retry with increased CU | 5.3 (expand) | MVP |
| 9 | Escalation visibility banners | 5.2.2 (expand) | MVP |
| 10 | Landmark control dashboard | 5.2.6.1 (new) | MVP |
| 11 | "Verified on-chain" indicator | 5.2.2 or 5.2.10 | MVP |
| 12 | Public status page | 4.7 (new) | MVP |
| 13 | Leaderboard transparency columns | 5.2.6 (expand) | MVP |
| 14 | Timeout consequences copy (incl. absolute UK deadline time) | 5.2.5.1 (expand) | MVP |
| 15 | Guardian failure UX (trigger contract + red badge + Telegram + manual CTA) | 5.2.5.1, 4.3 (expand) | MVP |
| 16 | `AttackResolved` event payload completeness | 3.3.12 (expand) | MVP |
| 17 | `GuardianFailure` notification contract (service → backend → client) | 4.3, 5.2.5.1 (expand) | MVP |
| 18 | Client-side `last_seen_reveals_modal` state | 5.2.5.3 (note) | MVP |
| 19 | Grace reveal | 10.2 | v2 |
| 20 | Tutorial battle | 10.2 | v2 |
| 21 | Anti-snowball tuning knobs | 10.2 | v2 |
| 22 | Seasonal parameter changelog | 10.2 | v2 |

#### 5.6.5 Contract Requirements

> The contracts below are defined in full in Sections 3.5.1 (`AttackResolved` payload) and 4.3.5.1 (`GuardianFailure` notification). This table is repeated here for frontend developer convenience.

These are data and event contracts that must be agreed between program, backend, and frontend before implementation begins. They're promoted from "implicit" to explicit because they're the most common source of "frontend blocked waiting on backend" delays.

| Contract | Owner | Consumer | What must be defined |
|----------|-------|----------|---------------------|
| `AttackResolved` event payload | Program (on-chain) | Indexer → Backend → Frontend | `attacker_committed`, `defender_revealed` (0 on timeout), outcome enum, surplus/refund amounts, `cooldown_end` timestamp, `guardian_reveal` boolean |
| `GuardianFailure` notification | Guardian service (backend) | WebSocket → Frontend, Telegram | `attack_id`, `hex_id`, failure reason enum, timestamp. Emitted when any guardian failure trigger condition is met. Frontend treats as boolean per `attack_id`. |
| Battle report storage | Backend DB | Frontend (via REST, attack history) | Stored per `attack_id`. Must include all `AttackResolved` fields plus `guardian_reveal`. Queryable by player wallet. |

---

## 6. Technical Considerations

### 6.1 On-Chain Map Data

The valid hex set and adjacency edges are stored directly on-chain, eliminating the need for Merkle proofs and off-chain proof services.

**ValidHexSet:** Sorted array of H3 indices stored in a PDA, with a parallel `region_ids` array mapping each hex to its named region. At ~500 hexes × 9 bytes = ~4.5KB, fits in a single account. Validation via binary search: O(log n) comparisons per lookup. Region assignment is read from the same index during `claim_hex`, eliminating the need for Merkle proofs.

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

**Guardian cost:** Guardian operation is funded by the admin (Guardian wallet transaction fees). Estimated additional cost: ~0.01 SOL per season for Guardian reveals (based on ~200 auto-reveals at 0.000005 SOL + priority fees). No cost to players.

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
- Implement Guardian service alongside crank (shared Node.js project)
- Guardian enrolment and packet management endpoints
- Attack monitoring and auto-reveal loop
- Telegram alerting for Guardian failure modes
- Integration test: enrol → commit defence → attack hex → verify Guardian auto-reveals → verify Clutch Defence NOT awarded
- Integration test: manual reveal in final hour → verify Clutch Defence IS awarded
- Integration test: packet sync failure → verify player alerted → manual reveal succeeds
- Deploy on NUC, connect to devnet
- End-to-end test: create season → upload map → join → claim → attack → resolve → end → finalize → cleanup → verify rent returned
- **Incentive simulation:** Run a simulated season with bots + scripted archetypes (turtle, aggressor, balanced, casual). Track: % of total points from passive income vs bonuses, captures per day, timeouts per day, landmark control duration. Target: bonus points should be 10–30% of total season points, not 50%+.

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
- Guardian toggle in defence settings
- Auto-sync: packet generation and upload on every defence operation
- Per-hex sync status indicator ("Guardian synced" / "Syncing..." / "Not synced")
- Sync failure warning with retry button
- Onboarding prompt after first hex claim (Guardian recommendation)
- Battle report rendering: "Revealed by: Guardian" / "Revealed by: Manual"
- Clutch Defence UI: final-hour countdown badge, war feed callout, player stat
- One-time tooltip for manual players entering clutch window
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
- **Phantom committed energy cleanup:** Resolved — `clear_phantom_energy` instruction handles the zero-hex-count case with fast-path cleanup.
- **SeasonCounters write contention:** At 200 players, Solana's parallelism handles the single `next_attack_id` PDA fine. At 500+ concurrent users, the single write lock becomes a bottleneck. When needed, split into domain-specific counters (AttackCounters, etc.) or use epoch-based ID allocation. Documented as a known scaling limit for v1.
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

**Scenario:** Player owns 15 standard hexes and 2 landmark hexes. Last update was 3 hours ago (10,800 seconds).

**Energy earned (floor division):**
- `energy_earned = floor((10800 * (15 * 1 + 2 * 3)) / 3600) = floor((10800 * 21) / 3600) = floor(63) = 63`
- 63 energy added (capped at 500)

**Points earned (floor division):**
- `points_earned = floor((10800 * (15 * 1 + 2 * 5)) / 3600) = floor((10800 * 25) / 3600) = floor(75) = 75`
- 75 points added to cumulative score

**Edge cases:**
- 1 hex for 1799 seconds at 1/hour: `floor(1799 * 1 / 3600) = floor(0.499) = 0 energy`
- 1 hex for 3601 seconds at 1/hour: `floor(3601 * 1 / 3600) = floor(1.0002) = 1 energy`
- 2 landmarks for 30 minutes (1800s) at 3/hour: `floor(1800 * 2 * 3 / 3600) = floor(3) = 3 energy`

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

## Appendix G: Guardian Reveal Packet Walkthrough

**Alice enables Guardian and defends 3 hexes.**

1. Alice enables Guardian in settings. Client generates symmetric key `K_guard` and sends it to the Guardian service alongside a wallet signature for authentication.
2. Alice submits `set_guardian` on-chain with the Guardian's pubkey.
3. Alice has 3 hexes with active commitments: Paris (50 energy), London (30 energy), Berlin (0 energy, initial bluff commitment).
4. Client generates reveal packets for Paris and London (not Berlin — zero-commitment packets are not created).
5. Each packet contains: `{ packet_format_version: 1, season_id, hex_id, owner_pubkey, energy_amount, opening_bytes, defence_nonce, packet_version: 1 }`.
6. Packets are encrypted with `K_guard` and uploaded to the Guardian.
7. Guardian stores: Paris packet (v1), London packet (v1). Frontend shows "synced" for Paris and London, "no packet" for Berlin.

**Alice reinforces Paris.**

8. Alice calls `increase_defence` on Paris with delta = 20. New total: 70 energy.
9. Client creates a new packet for Paris: `{ ..., energy_amount: 70, opening_bytes: r_new, defence_nonce: new_nonce, packet_version: 2 }`.
10. Packet uploaded to Guardian, replacing the v1 packet. Guardian now has Paris (v2), London (v1).

**Bob attacks London.**

11. Guardian observes `AttackLaunched` targeting London, defender = Alice.
12. Guardian looks up packet for (season, Alice, London). Found: v1 packet.
13. Guardian decrypts packet. Sanity checks: `packet.defence_nonce == on_chain_hex.defence_nonce`. Match.
14. Guardian submits `reveal_defence(energy_amount=30, opening_bytes=r_london)` signed by Guardian keypair.
15. On-chain: program verifies `player.guardian == Some(guardian_pubkey)`. Verified. Pedersen opening verified. Combat resolved: Bob committed 25 energy, Alice revealed 30. Defender wins.
16. Clutch Defence check: `guardian_reveal == true` — bonus NOT awarded. (Alice used Guardian.)
17. Guardian deletes London packet (commitment consumed). Alice must recommit and re-sync if she wants Guardian coverage on London again.

**Charlie attacks Paris while Alice is asleep. Guardian is down.**

18. Guardian service crashed 10 minutes ago. Attack on Paris is not processed.
19. Guardian monitoring detects the outage and sends Telegram alert: "Guardian service unavailable. You may need to reveal manually."
20. Alice wakes up, sees the Telegram notification and the in-app attack alert.
21. Alice opens the app, sees "Guardian — auto-reveal unavailable" and the attack countdown (4h 12m remaining).
22. Alice reveals manually using the standard one-tap reveal flow. Reveal succeeds.
23. Because Alice revealed manually, the clutch window check applies. She revealed with 4h 12m remaining — not in the final hour. No Clutch Defence bonus.

**Dave attacks Berlin (zero-commitment hex).**

24. Guardian has no packet for Berlin (zero-commitment, no packet created).
25. Guardian sends Telegram alert: "Guardian could not auto-reveal Berlin — no synced packet. Reveal manually. Deadline: [time]."
26. Alice must reveal manually. She knows Berlin has 0 energy committed — she'll lose it regardless. She can choose to reveal 0 (confirming to the attacker) or let it timeout.

**Eve is a manual player. She clutch-defends Madrid.**

27. Eve has Guardian disabled. Her hex Madrid is attacked with 35 energy.
28. Eve sees the attack, notes she has 40 energy committed to Madrid.
29. Eve waits. The countdown ticks down. At 45 minutes remaining, she submits `reveal_defence`.
30. On-chain: `caller == attack.defender` (manual reveal). Pedersen verified. Eve's 40 > attacker's 35. Defender wins.
31. Clutch check: `!guardian_reveal`, `deadline - now <= 3600` (45 min < 60 min), `defender_wins`. Clutch Defence bonus awarded: +12 points.
32. War feed: "Clutch Defence! Eve held Madrid in the final hour. +12"
33. Eve's `clutch_defences` stat increments to 1.

---

*End of specification.*

