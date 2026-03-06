# Solvasion v1.8 Implementation Log

**Date:** 2026-03-05
**Scope:** 9-wave feature plan implementing all 14 recommendations from the player experience pre-mortem review.
**Status:** All 9 waves implemented. Program requires `anchor build && anchor deploy` before on-chain changes (Waves 6-7) are live.

---

## Wave 1: Season Parameter Tuning

**No code changes — config values only.**

| Parameter | Old Value | New Value | Rationale |
|-----------|-----------|-----------|-----------|
| `victoryThreshold` | 50,000 | 100,000 | A player with 15 hexes hit 50K by Day 17 from income alone — before Stage 2 fires. 100K ensures the landmark-decisive endgame plays out. |
| `escalationStart` | Day 21 | Day 14 | Shrinks dead-middle War Phase from 14 to 10 days. |
| `escalationStage2Start` | Day 25 | Day 20 | Gives Stage 2 a full 8 days instead of 4. |
| `theatreCaptureBonusPoints` | 100 | 200 | Makes theatre windows a meaningful catch-up mechanic. |
| `lateJoinBonusEnergy` | 50 | 250 | Week 2 joiners can immediately claim 25 hexes instead of spending Day 1 accumulating. |

**Files changed:**
- `tests/helpers.ts` — `createTestSeason()` params
- `scripts/setup-test-season.ts` — E2E season setup params

---

## Wave 2: Surface Hidden War Feed Events

**Backend only — replaced `logger.debug()` calls with `addWarFeed()` inserts.**

Six events that were previously indexed but invisible to players now appear in the war feed:

| Event | War Feed Message |
|-------|-----------------|
| `DefenceIncreased` | "[Player] reinforced [hex_name] (+N energy)" |
| `RetaliationTokenGranted` | "[Player] earned a retaliation token against [target]" |
| `RetaliationTokenUsed` | "[Player] used a retaliation discount against [target]!" |
| `PostureSet` | "[Player] is now Fortifying [hex] / Mobilising toward [hex] / Standing Down" |
| `TheatreBonusAwarded` | "[Player] earned a theatre [type] bonus (+N pts) at [hex_name]!" |
| `LandmarkCaptureBonus` | "[Player] captured landmark [hex_name]! (+N bonus pts)" — handler was completely missing, now added |

Also fixed:
- `ClutchDefence` handler: uses `hexLabel()` instead of raw hex ID
- `GuardianRevealSubmitted` handler: uses `hexLabel()` instead of raw hex ID

**Files changed:**
- `backend/src/indexer/handlers.ts`

---

## Wave 3: Frontend UX — Orders Panel + Battle Report

### Orders Panel (`OrdersPanel.tsx`)
New sidebar section showing prioritized action items:
1. **Reveals Due** — Pending attacks requiring reveal, with countdown timer and "Reveal" button (red background)
2. **Ungarrisoned Hexes** — Owned hexes with no defence commitment, with "Garrison" button (yellow)
3. **Landmarks at Risk** — Player's landmark hexes adjacent to enemy territory (orange)
4. **Suggested Targets** — Enemy hexes adjacent to player territory with no visible commitment (blue)

### Battle Report Modal (`BattleReportModal.tsx`)
Modal shown after attack resolution when the connected player is involved:
- Header: outcome badge (Victory/Defeat/Timeout)
- Two-column comparison: attacker energy vs defender energy
- Surplus returned / refund details
- Post-battle advice (e.g. "Garrison consumed — recommit now" for defender wins)
- Triggered automatically via WebSocket `AttackResolved` event

**Files created:**
- `frontend/src/components/Sidebar/OrdersPanel.tsx`
- `frontend/src/components/BattleReportModal.tsx`

**Files changed:**
- `frontend/src/components/Sidebar/Sidebar.tsx` — new props, renders OrdersPanel
- `frontend/src/App.tsx` — battleReport state, WebSocket trigger, modal render

---

## Wave 4: Telegram Notifications

### Architecture
Lightweight fetch-based Telegram Bot API integration (no `node-telegram-bot-api` dependency). Uses long-polling for `/start` and `/stop` commands from players.

### Registration Flow
Player sends `/start <wallet_address>` to the Telegram bot. Bot stores `(wallet, chat_id)` mapping. `/stop` disables notifications.

### Notification Triggers
1. **Attack launched** against subscribed defender — immediate alert with hex name, attacker, energy, deadline
2. **50% countdown** — scheduled reminder
3. **1 hour remaining** — scheduled reminder
4. **15 minutes remaining** — urgent scheduled reminder
5. **Attack resolved** — outcome notification to both parties
6. **Guardian failure** — immediate alert
7. **Bot incursion warning** — 6-hour advance notice

### Message Templates
Formatted with hex name, countdown, and action prompts. Example:
```
INCOMING ATTACK on Paris
Attacker: Abc12...f89 committed 45 energy
Deadline: 14:32 UTC (2h 14m remaining)
-> Open Solvasion to reveal your garrison
```

**Files created:**
- `backend/src/telegram/index.ts` — TelegramService (polling, sending, scheduled reminders)
- `backend/src/telegram/templates.ts` — message templates

**Files changed:**
- `backend/db/schema.sql` — `telegram_subscriptions` table
- `backend/src/db.ts` — prepared statements for telegram subscriptions
- `backend/src/config.ts` — `TG_BOT_TOKEN`, `TG_ENABLED` config fields
- `backend/src/main.ts` — start/stop TelegramService
- `backend/src/indexer/handlers.ts` — wired `tgNotifyAttack` and `tgNotifyResolved` into event handlers

---

## Wave 5: Bot Incursions

### Incursion Flow
1. Every 3-5 days (randomised), a bot faction picks a target region
2. War feed announcement: "[Faction] is preparing an assault on [Region]! Attacks in 6 hours."
3. Telegram alerts sent to all human players with territory in that region
4. After 6 hours, bot launches 3-5 simultaneous attacks on human-owned hexes in that region
5. War feed entries for each attack with faction taunts

### Bot Intelligence Improvements
- **Landmark prioritisation**: 40% chance to target landmark hexes (was random)
- **Incursion region targeting**: during active incursion, bot attacks focus on the announced region
- **Phase-scaled energy**: War=20-40, EscalationStage1=30-55, EscalationStage2=40-70, incursion adds +10/+15

**Files created:**
- `backend/src/bots/incursions.ts` — IncursionPlan, scheduler, announcement, telegram integration

**Files changed:**
- `backend/src/bots/strategy.ts` — incursion region targeting, landmark prioritisation, energy scaling
- `backend/src/bots/index.ts` — wired incursion scheduler start/stop

---

## Wave 6: On-Chain Balance Mechanics

### 6.1 Hex Fortification Bonus

Hexes held longer become harder to capture. Defence energy is multiplied by a bonus based on days held.

**Formula:**
```
days_held = (now - hex.last_owner_change) / 86400
fortification_bps = min(days_held * fortification_bonus_bps_per_day, fortification_max_bps)
effective_defence = energy_amount * (10000 + fortification_bps) / 10000
```

**Default values:** +10% per day (`1000 bps`), capped at +50% (`5000 bps`).

The bonus is public knowledge — anyone can calculate it from the hex's `last_owner_change` timestamp. This rewards holding territory and creates a natural advantage for defenders who have been entrenched for days.

### 6.2 Comeback Energy Burst

When a player drops below `comeback_threshold` hexes (default: 3) from a previous peak of `comeback_min_peak` or more (default: 10), they receive a one-time `comeback_energy` burst (default: 200 energy). The `comeback_used` flag prevents repeat triggers.

Checked in both `reveal_defence` (attacker wins branch) and `resolve_timeout`.

### On-Chain Account Changes

**Season struct** — new fields:
- `fortification_bonus_bps_per_day: u16`
- `fortification_max_bps: u16`
- `comeback_energy: u32`
- `comeback_threshold: u32`
- `comeback_min_peak: u32`

**Player struct** — new fields:
- `peak_hex_count: u32` — tracked in `claim_hex`, `reveal_defence`, `resolve_timeout`
- `comeback_used: bool`

**New event:** `ComebackBurst { season_id, player, energy_granted, hex_count, peak_hex_count }`

**Files changed:**
- `programs/solvasion/src/state/season.rs`
- `programs/solvasion/src/state/player.rs`
- `programs/solvasion/src/instructions/create_season.rs` — new params
- `programs/solvasion/src/instructions/reveal_defence.rs` — fortification bonus + comeback burst
- `programs/solvasion/src/instructions/resolve_timeout.rs` — comeback burst
- `programs/solvasion/src/instructions/claim_hex.rs` — peak_hex_count tracking
- `programs/solvasion/src/events.rs` — ComebackBurst event
- `tests/helpers.ts` — new season params
- `scripts/setup-test-season.ts` — new season params
- `backend/src/indexer/handlers.ts` — ComebackBurst handler with war feed
- `frontend/src/components/Map/HexInfoPanel.tsx` — fortification level display

---

## Wave 7: Social Mechanics

### 7.1 Daily Contracts (Backend Display Layer)

Three daily contracts generated at midnight UTC, providing direction for every player. Contracts are a framing layer over existing mechanics — they track and celebrate actions players can already take.

**Contract types:**
- "Attack any hex in [Region]" — +150 pts
- "Defend N attacks successfully" — +100 pts per N
- "Capture a landmark" — +200 pts
- "Reinforce N hexes" — +50 pts
- "Capture N hexes in active theatre" — +150 pts

Progress is tracked server-side via event handlers. No on-chain changes required.

### 7.2 Enforceable Non-Aggression Pacts (On-Chain)

Two players co-sign a time-limited non-aggression pact. Breaking it costs a flat point penalty enforced on-chain.

**New on-chain account:** `Pact` PDA seeded `["pact", season_id, sorted(player_a, player_b)]`
```rust
pub struct Pact {
    pub season_id: u64,
    pub player_a: Pubkey,    // sorted: a < b
    pub player_b: Pubkey,
    pub expires_at: i64,
    pub broken: bool,
    pub broken_by: Pubkey,
    pub accepted: bool,
}
```

**New instructions:**
- `propose_pact(duration: i64)` — creates Pact PDA, max 48 hours
- `accept_pact()` — other party activates the pact

**Pact enforcement:** `launch_attack` scans `remaining_accounts` for an active Pact between attacker and defender. If found: deducts `pact_break_penalty_points` (default: 500) from attacker, marks pact as broken, emits `PactBroken` event.

**New Season params:** `pact_break_penalty_points: u32`, `pact_max_duration: i64`

**New error codes:** `PactAlreadyAccepted`, `PactBroken`

**New events:** `PactProposed`, `PactAccepted`, `PactBroken`

**Files created:**
- `programs/solvasion/src/state/pact.rs`
- `programs/solvasion/src/instructions/propose_pact.rs`
- `programs/solvasion/src/instructions/accept_pact.rs`
- `backend/src/contracts.ts` — ContractService
- `backend/src/api/routes/contracts.ts` — API endpoints
- `frontend/src/components/Sidebar/ContractsPanel.tsx`

**Files changed:**
- `programs/solvasion/src/state/mod.rs` — pact module
- `programs/solvasion/src/instructions/mod.rs` — propose_pact, accept_pact modules
- `programs/solvasion/src/lib.rs` — instruction entrypoints
- `programs/solvasion/src/errors.rs` — new error codes
- `programs/solvasion/src/events.rs` — pact events
- `programs/solvasion/src/instructions/launch_attack.rs` — pact-break check via remaining_accounts
- `programs/solvasion/src/instructions/create_season.rs` — pact params
- `backend/db/schema.sql` — `pacts`, `contracts`, `contract_progress` tables
- `backend/src/db.ts` — prepared statements
- `backend/src/api/index.ts` — register contract routes
- `backend/src/main.ts` — start/stop ContractService
- `backend/src/indexer/handlers.ts` — PactProposed, PactAccepted, PactBroken handlers
- `tests/helpers.ts` — pact params + `findPact` PDA helper
- `scripts/setup-test-season.ts` — pact params
- `frontend/src/components/Sidebar/Sidebar.tsx` — ContractsPanel integration
- `frontend/src/App.tsx` — apiBase prop

---

## Wave 8: Fog-of-War Map Visualization

Distant hexes fade based on proximity to player territory. Uses BFS from the player's owned hexes through the adjacency graph.

**Opacity levels:**
| Hex Category | Opacity |
|-------------|---------|
| Player's own hexes | 0.8 |
| Adjacent to player territory (1 hop) | 0.6 |
| 2 hops away | 0.4 |
| 3+ hops (far) | 0.2 |
| Unclaimed hexes | 0.15 |

When no player is connected (spectator mode) or fog is toggled off, all hexes render at full opacity (1.0).

**Toggle:** "Fog of War" checkbox in the map legend. Enabled by default when a wallet is connected.

**Files changed:**
- `frontend/src/utils/hexGeoJson.ts` — `FogOptions` interface, `computeHopDistances()` BFS, opacity-aware feature props
- `frontend/src/types/index.ts` — `opacity: number` added to `HexFeatureProps`
- `frontend/src/components/Map/MapView.tsx` — `fill-opacity` uses `['get', 'opacity']` instead of hardcoded 1
- `frontend/src/components/Map/MapLegend.tsx` — fog toggle button
- `frontend/src/App.tsx` — `fogEnabled` state, fog options passed to `buildHexGeoJson`, toggle wired to MapLegend

---

## Wave 9: Season Replay / Spectator Mode

After a season ends, anyone can replay the entire season's territorial history as a time-lapse.

### Backend

**New endpoint:** `GET /api/seasons/:id/replay`

Returns all hex ownership change events in chronological order, sourced from the `war_feed` table. Filters for `HexClaimed`, `AttackResolved`, and `PhaseChanged` events. Response is cached for 24 hours for completed seasons (immutable data).

**Compact replay format:**
```json
{
  "season_id": 1,
  "events": [
    { "t": 1709654400, "h": "832830...", "type": "claim", "to": "Abc12..." },
    { "t": 1709654410, "type": "phase", "msg": "Phase changed to War" },
    { "t": 1709655000, "h": "832831...", "type": "capture", "from": "Def34...", "to": "Abc12..." }
  ]
}
```

### Frontend

**Component:** `ReplayView.tsx` — full-screen map with replay controls:
- Play/Pause button
- Speed selector: 1x, 10x, 100x, 1000x
- Timeline scrubber (range input)
- Current timestamp and event count display
- Phase transition display
- Proportional timing — delays between events reflect real time gaps (capped at 2 seconds)

**Access:** URL hash `#replay/N` where N is the season ID. Example: `solvasion.gg/#replay/1`

Exit button returns to the main game view.

**Files created:**
- `backend/src/api/routes/replay.ts`
- `frontend/src/components/ReplayView.tsx`

**Files changed:**
- `backend/src/api/index.ts` — register replay routes
- `frontend/src/App.tsx` — `replaySeasonId` state, hash-based routing, conditional ReplayView render

---

## Deployment Notes

### What requires `anchor build && anchor deploy`:
- Wave 6: Fortification bonus and comeback burst (Season + Player struct changes, reveal_defence/resolve_timeout/claim_hex logic changes)
- Wave 7: Pact system (new Pact account, propose_pact/accept_pact instructions, launch_attack pact-break check, new Season fields)

**Account size impact:** Season and Player structs have grown. Existing deployed accounts will need reallocation or a fresh season. The changes are additive (new fields appended), so new seasons created after deploy will work correctly.

### What works immediately (no deploy needed):
- Wave 1: Season params — just change values in `createSeason` calls
- Waves 2-5: Backend-only changes — restart backend
- Wave 3: Frontend components — rebuild frontend
- Wave 8-9: Frontend + backend — rebuild both

### Environment variables needed:
- `TG_BOT_TOKEN` — Telegram bot API token (Wave 4)
- `TG_ENABLED=true` — enable Telegram notifications (Wave 4)

### Database migration:
Delete `backend/db/solvasion.sqlite` and restart backend (or run schema manually). New tables: `telegram_subscriptions`, `contracts`, `contract_progress`, `pacts`.
