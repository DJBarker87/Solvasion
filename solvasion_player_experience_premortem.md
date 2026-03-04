# Solvasion — Player Experience Pre-Mortem

**Purpose:** Map the top ways players rage-quit to concrete spec requirements. Each scenario identifies what's already covered, what's new, and the exact acceptance criteria for the frontend build.

**Companion to:** Solvasion Pre-Build Review (spec correctness) and Design Specification v1.7.4

---

## How This Document Works

Each rage-quit scenario is assessed against the current spec (v1.7.4) and the pre-build review. Items are tagged:

- **✅ Already specified** — exists in spec or review doc, just needs building
- **🔧 Needs spec addition** — new requirement for v1.7.5 UX addendum
- **📋 Frontend-only** — no spec change needed, pure UI/UX implementation work
- **🔮 Defer to v2** — good idea, not MVP

The final section distils everything into three "non-negotiable" MVP features with acceptance criteria.

---

## 1. "I lost because I forgot to reveal. That's dumb."

The single most likely churn event. Commitment systems punish forgetfulness more than strategy if the UX isn't relentless.

### What's already in the spec

- ✅ Countdown badge on attacked hexes with colour progression: green → yellow → red → flashing red (5.2.5.1)
- ✅ Persistent attack alert banner linking to prefilled reveal screen (5.2.5.1)
- ✅ One-tap reveal screen: shows hex, attacker energy, player's committed defence, single "Reveal and Defend" button (5.2.5.1)
- ✅ Telegram notifications at attack launch, 50% countdown, 1h remaining, 15min remaining (5.2.5.1)
- ✅ Phantom recovery: 50% energy recovery after 24h delay for timeout losses (3.3.27, updated to flat amount per pre-build review 1.4)

### What's new — add to spec

- 🔧 **"Reveals Due" screen (batch reveal).** A dedicated screen (accessible from the Orders panel and as auto-open on app load) showing ALL hexes currently under attack with countdowns, sorted by urgency. Each row shows: hex name, attacker energy, player's committed garrison, countdown, deadline as absolute time (UK time), and a "Reveal" button. At the top: a "Reveal All" button that submits sequential transactions (one per hex, since each requires a separate Pedersen opening). The wallet may prompt per transaction depending on wallet adapter; the UI must keep the player in one continuous batch flow with progress indicator ("Revealing 2 of 3..."). If any reveal fails, the batch pauses on that hex and offers Retry / Skip / Cancel Batch — never leaves the player in a half-completed state.

  **Auto-open rule:** The Reveals Due modal opens on app load if: (A) any reveal has less than 3 hours remaining, OR (B) the player has not seen the modal since the last app session AND at least one reveal is pending. This avoids nagging on every load while still protecting forgetful players. The client stores a `last_seen_reveals_modal` timestamp locally.

  **Spec section:** Add to 5.2.5.1 or new 5.2.5.3

- 🔧 **Clear copy on timeout consequences.** Everywhere a countdown appears, include the subtext: "If you don't reveal, your garrison is treated as 0 and you lose the hex." This must appear in: the attack alert banner, the Reveals Due screen, and every Telegram notification. Every Telegram notification must also include the absolute deadline time in UK time (e.g., "Reveal by 14:32 UK time"), hex name, and attacker energy.

  **Spec section:** 5.2.5.1

- 🔮 **Grace reveal (defer to v2).** A one-time-per-season "emergency defend" that allows a player to reveal after the deadline has passed, at a steep energy cost (e.g., 2× the committed amount deducted from energy_balance). Burns a limited resource (one per season) to save casuals without being exploitable by grinders. This requires an on-chain instruction and is not MVP, but worth noting in Section 10.2 (Future Features) as a retention tool.

  **Spec section:** 10.2

### Acceptance criteria (MVP)

1. On app load matching auto-open rule (reveal <3h away, or first session with pending reveals): modal shell appears immediately; reveal list populates within 1s from local data or within 3s from WebSocket/RPC fetch.
2. "Reveal All" submits sequential transactions. Wallet prompts may appear per tx. UI shows progress ("Revealing 2 of 3..."). If any tx fails, batch pauses on that hex with Retry / Skip / Cancel. No double reveals; timers continue updating during batch.
3. Every Telegram notification includes: hex name, attacker energy, deadline as absolute UK time ("Reveal by 14:32 UK time"), and "If you don't reveal, your garrison is treated as 0."
4. Countdown badge visible on map at all zoom levels where the hex is visible.
5. **Smoke test:** 3 simultaneous attacks; one reveal tx fails once due to RPC; player retries and completes all 3; no double reveals; timers updated throughout.
6. Each reveal row becomes disabled once a tx is in-flight or confirmed. Batch flow is idempotent: uses `attack_id` to ensure a revealed attack is never re-submitted. Prevents spam-click double-spend.

---

## 2. "I revealed and my defence got 'consumed' — why would I ever defend?"

Players expect defence to be a permanent wall. The spec's model (defence is a spendable resource, consumed on reveal) is correct game design but will confuse new players unless framed properly.

### What's already in the spec / review

- ✅ Defence Lifecycle section (new 2.5.8, from pre-build review 1.3) explains the consume-and-recommit cycle
- ✅ Post-defence recommit flow with one-click "Recommit same amount" (pre-build review 1.3, Section 5.2.5.2)
- ✅ 4-hour defender-win cooldown as recommit grace window (pre-build review 1.3)

### What's new — add to spec

- 🔧 **Naming: "Garrison" instead of "Defence" in all player-facing UI.** The word "defence" implies permanence. "Garrison" implies troops stationed at a position — spendable, replaceable. All UI copy, tooltips, notifications, and the war feed should use "garrison" for the per-hex committed energy. The on-chain field names remain `defence_commitment` etc. (no program change), but every frontend string uses "garrison."

  Examples:
  - "Commit garrison" not "Commit defence"
  - "Your garrison was spent in battle. Recommit now."
  - "Garrison: 30 energy committed to this hex"

  **Spec section:** Add a "Player-Facing Terminology" note to Section 5.1 or 5.2

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

  **Spec section:** New 5.2.5.3 "Battle Report" or add to existing 5.2.5

- 📋 **First-time tooltip.** On the player's first `increase_defence` action, show a one-time tooltip: "Garrison is like ammunition — it's spent when you fight. After each battle, recommit to reload." Dismissible, stored in localStorage. No spec change needed, pure frontend.

### Acceptance criteria (MVP)

1. Every combat resolution (reveal or timeout) shows a battle report with both sides' numbers and the outcome logic.
2. Defender-win report includes "Garrison remaining: 0 (recommit!)" to make consumption explicit.
3. Battle report includes a "Recommit Garrison" or "Garrison This Hex" CTA.
4. All player-facing text uses "garrison" not "defence" for per-hex energy commitments.
5. First-time tooltip appears on first garrison action.
6. Battle reports are retrievable from attack history by `attack_id`. Stored data includes: `attacker_committed`, `defender_revealed` (or 0 on timeout), outcome enum, refunds/returns, `cooldown_end`, and `guardian_reveal` flag.
7. Battle report displays "Revealed by: Manual" or "Revealed by: Guardian" when the defender revealed (not shown on timeout).
8. **Smoke test:** Timeout capture report shows "Defender did not reveal" prominently, includes default-win and refund maths. Defender sees the same report and understands why they lost.

---

## 3. "I got attacked and it felt random / unfair."

Fog-of-war mechanics can feel like coin flips unless the game shows *why* things happened and gives attackers a sense of risk assessment.

### What's already in the spec

- ✅ War feed shows attacks, captures, defences with named hexes and regions (5.2.8)
- ✅ Attack energy is publicly visible when launched (2.4.1)
- ✅ `increase_defence` delta is visible, building a public lower bound (2.5.4)

### What's new — add to spec

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

  **Spec section:** Add to 5.2.3 (Hex Action Panel, enemy hex)

- 🔮 **Tutorial battle (defer to v2).** A simulated attack/defend cycle during onboarding that teaches the commit → attack → reveal → outcome → recommit loop with fake energy and a bot opponent. Complex to build, high impact for retention, but not MVP.

  **Spec section:** 10.2

### Acceptance criteria (MVP)

1. Attack panel shows garrison status (committed / not committed) and known reinforcement history for the target hex.
2. Every battle report (from #2 above) shows both sides' numbers, not just the outcome.

---

## 4. "Whales / grinders dominate. I can't catch up."

On-chain games snowball unless there are visible catch-up paths.

### What's already in the spec

- ✅ Energy cap (500) prevents extreme hoarding (2.3.4)
- ✅ Escalation phases reduce attack costs and increase energy income (2.2.1)
- ✅ Theatre bonuses reward aggression in specific regions (2.8)
- ✅ Landmark decisiveness in Stage 2 creates high-value targets (2.2.1)
- ✅ Perimeter scaling means more territory = thinner defence (2.3.4)

### What's new — add to spec

- ✅ **"Opportunity Radar" — folded into Orders Panel (Section 8, item #5.2.9).** The opportunity items (active theatres, weakly held landmarks, ungarrisoned adjacent hexes, recent nearby battles) are sections 3–5 of the Orders panel. No separate UI component in v1. This avoids two half-finished features.

- 🔮 **Anti-snowball tuning knobs (defer to v2).** Consider for Season 2+: escalating energy cost to hold landmarks beyond N (e.g., landmarks 1–3 normal, landmarks 4–5 cost 2× maintenance energy), or diminishing point returns beyond a territory threshold. These are tuning levers, not structural changes — the Season parameter system already supports them. Note in 10.2.

### Acceptance criteria (MVP)

1. Sidebar includes an "Opportunities" section showing at least: active theatres with countdown, and hexes adjacent to player territory with no garrison.

---

## 5. "Bots / multi-wallets are everywhere."

### What's already in the spec / review

- ✅ Active defence requirement makes multi-wallet management genuinely burdensome (Section 8)
- ✅ Energy cap prevents compounding (Section 8)
- ✅ Pre-build review 3.3: backend tracks "same funding wallet" patterns
- ✅ Pre-build review 3.3: refundable deposit as future friction

### What's new — add to spec

- 🔧 **Transparency leaderboard columns.** The leaderboard (5.2.6) should include columns or filters for: total hexes, total attacks launched, reveal consistency (% of attacks defended vs timed out), and account age (joined_at). This surfaces suspicious patterns (accounts with many hexes but 0% reveal rate, or accounts created on the same day) without requiring KYC.

  **Spec section:** 5.2.6

- 📋 **Multi-wallet labour as deterrent.** No spec change needed — the existing commit/reveal mechanics already make multi-wallet play burdensome. The key is NOT to add quality-of-life features that accidentally make multi-wallet easier (e.g., don't add "manage all accounts from one dashboard").

### Acceptance criteria (MVP)

1. Leaderboard shows reveal consistency (defences made / attacks received) as a visible column.

---

## 6. "The backend glitched and my state was wrong."

### What's already in the spec / review

- ✅ Pre-build review 2.11: indexer/backfill correctness, rebuild-from-chain procedure
- ✅ Backend is a read cache — on-chain state is authoritative (4.1, 4.6)
- ✅ Reconciliation crank catches drift every 2–3 minutes (4.3.2)

### What's new — add to spec

- 🔧 **"Verified on-chain" indicator.** Every data-displaying screen shows a small "Last synced: slot #X, Ys ago" indicator in the footer or status bar. If the indexer is more than 5 minutes behind, show: "Index catching up — chain is source of truth. [Refresh from chain]". The "Refresh from chain" button triggers a direct RPC fetch of the player's accounts and rebuilds local state.

  **Spec section:** 5.2.2 (Map View) or new 5.2.10 "Data Freshness"

- 🔧 **Public status page.** A simple status page (e.g., status.solvasion.io) showing: indexer lag (seconds behind tip), RPC health (latency + error rate), crank last run time, and active season summary. Built from the crank's own monitoring data.

  **Spec section:** 4.6 (Resilience) or new 4.7

### Acceptance criteria (MVP)

1. "Last synced" indicator visible on main game screen.
2. "Refresh from chain" button available when indexer lag exceeds 5 minutes.

---

## 7. "Transactions fail / fees / wallets are painful."

### What's already in the spec

- ✅ `commit_defence` batches up to 21 commitments per transaction (6.6)
- ✅ Error handling with clear states and retry option (5.3)
- ✅ Player cost model showing minimal net costs (6.5)

### What's new — add to spec

- 🔧 **Pre-flight transaction simulation.** Before prompting wallet signature on any transaction, the frontend runs `simulateTransaction` and shows: estimated compute units, estimated fee, and any predicted errors. If simulation fails, show the error *before* the player signs (not after). This catches: insufficient energy, hex under attack, cooldown active, and CU budget issues before they become failed transactions.

  **Spec section:** Add to 5.3 (Transaction Flow)

- 🔧 **Retry with increased CU.** On transaction failure due to compute budget exceeded, show: "Transaction failed (compute limit). [Retry with higher limit]" — the retry button resubmits with `requestUnits(400_000)` instead of default.

  **Spec section:** Add to 5.3 (Transaction Flow)

- 📋 **Batch reveal (from #1).** Already covered above. Signing frequency stays low because reveals are the only time-pressured action, and batching keeps it to one signing session.

### Acceptance criteria (MVP)

1. Every transaction is simulated before signing. Predicted failures show the error to the player without prompting wallet.
2. On compute budget failure, "Retry with higher limit" button is available.

---

## 8. "I don't know what to do next."

The single biggest UX gap in the current spec. Sandbox games need direction. The spec describes many features (theatres, landmarks, contracts, bounties) but no central place that tells the player "here's what to do right now."

### What's already in the spec

- ✅ Sidebar shows stats, leaderboard, active attacks (5.2.2)
- ✅ Contracts and bounties provide daily/weekly objectives (4.3.6)
- ✅ War feed shows recent events (5.2.8)

### What's new — add to spec

- 🔧 **"Orders" panel.** A single, always-accessible panel (top of sidebar or dedicated tab) that shows the player's prioritised action list. Items sorted by urgency:

  1. **Reveals due** — hexes under attack with countdowns. Red if < 1h. Links to Reveals Due screen.
  2. **Garrisons to recommit** — hexes with `has_commitment == false` (post-combat or post-withdrawal). Shows cooldown remaining if protected. Links to garrison panel.
  3. **Active theatres** — current theatre regions with time remaining and "X of your hexes are in this theatre." Links to theatre region on map.
  4. **Landmarks at risk** — landmarks adjacent to enemy territory or recently attacked. Links to landmark on map.
  5. **Suggested targets** — 2–3 enemy hexes adjacent to player territory, sorted by opportunity (no garrison > recently defended > unknown), with risk tier label (Low / Medium / High / Unknown). Links to hex on map.
  6. **Daily contract progress** — "Attack 1 hex: 0/1. Defend 1 hex: 1/1." Links to contracts screen.

  The panel updates in real-time via WebSocket. Empty states show encouraging copy: "All clear — expand your territory or reinforce your borders."

  The Orders panel replaces the need for players to mentally synthesise information from the sidebar, war feed, map, and notifications. It's the "what should I do?" answer.

  **Spec section:** New 5.2.9 "Orders Panel" — this is a first-class frontend feature, not a nice-to-have.

### Acceptance criteria (MVP)

1. Orders panel is visible on the main game screen without scrolling or navigating.
2. Reveals due appear at the top with countdown and direct link to reveal action.
3. At least 3 of the 6 item types are populated during active gameplay.
4. Panel updates within 5 seconds of relevant on-chain events (via WebSocket).

---

## 9. "Endgame drags / stalemates / no climax."

### What's already in the spec / review

- ✅ Two-stage escalation with landmark decisiveness (2.2.1)
- ✅ Pre-build review 3.6: 4+ day Stage 2, 10+ landmarks across 5+ regions
- ✅ Victory threshold with early victory mechanic (2.6.2)
- ✅ War feed announces phase changes and victory proximity (5.2.8)

### What's new — add to spec

- 🔧 **Escalation visibility.** The main game screen must show escalation status prominently (not buried in sidebar):

  - **Pre-escalation:** "Escalation in X days. Energy income and attack costs will change."
  - **Stage 1:** Banner: "ESCALATION STAGE 1 — Energy ×1.5, Attack cost ×0.85. Stage 2 in X days."
  - **Stage 2:** Prominent banner: "ESCALATION STAGE 2 — Landmarks worth 25 pts/hr. The endgame is here."
  - **Victory proximity:** When any player exceeds 80% of victory threshold: persistent alert: "[Player] at 42,000/50,000 points. [View their territory]"

  **Spec section:** 5.2.2 (Map View), expand the existing sidebar spec

- 🔧 **Landmark control dashboard.** A dedicated view (or section of the leaderboard) showing all landmarks, current holders, and projected impact:

  - "If [Player] holds Paris, London, Berlin for 2 more days, they win."
  - "Contesting any one of these landmarks delays victory by ~X hours."

  This turns the endgame from abstract point accumulation into a concrete, legible narrative.

  **Spec section:** New 5.2.6.1 or expand 5.2.6

### Acceptance criteria (MVP)

1. Escalation stage banner is visible on the main game screen during Stage 1 and Stage 2.
2. Victory proximity alert appears when any player exceeds 80% of threshold.
3. Landmark holders are visible on the leaderboard or a dedicated landmarks view.

---

## 10. "The meta is solved; newcomers are target practice."

This is a Season 2+ concern. The first season IS the meta discovery period.

### What's already in the spec

- ✅ Season parameters are configurable (all energy rates, multipliers, thresholds)
- ✅ Map resolution is configurable per season (2.1)
- ✅ Theatre rotation creates shifting focal points (2.8)
- ✅ Bot factions provide varied opposition (4.3.4)

### What's new — note for future

- 🔮 **Seasonal parameter changelog.** For Season 2+, publish a "Season X Changes" document before each season: adjusted energy rates, new landmark positions, modified theatre bonus values. Public, not arbitrary. This signals that the meta intentionally evolves.

- 🔮 **Newcomer-friendly theatre design.** Design some theatre events that reward "first capture in theatre" or "smallest empire captures a theatre hex" — opportunities where being small is an advantage, not a handicap.

- 🔮 **Map layout variation.** Different geographic regions or resolutions per season. The H3 system supports this natively.

**Spec section:** 10.2 (Future Features)

### Acceptance criteria (MVP)

None for v1. Track for Season 2.

---

## 11. "Guardian was enabled but it didn't reveal and I still lost."

The most emotionally explosive failure mode. Players who set up auto-reveal (guardian) and still lose a hex to timeout will feel the system scammed them. This must be handled explicitly because the narrative will be "the game is broken" not "my reveal failed."

### What's already in the spec

- ✅ Guardian/auto-reveal system described in spec (5.2.5.1, backend guardian service)
- ✅ Guardian reveal is a backend service that submits reveal transactions on behalf of the player when they're offline

### What's new — add to spec

- 🔧 **Guardian failure UX.** When the guardian service declares a failure, the system must:

  **Trigger definition:** A "guardian failure" is declared when: the defender has guardian enabled AND an attack is pending AND any of the following are true: (a) guardian has no valid reveal packet for this hex, (b) nonce mismatch between packet and on-chain hex state, (c) reveal transaction submission fails after all retries, (d) guardian wallet has insufficient SOL to submit, or (e) guardian never detected the attack (indexer lag > attack deadline minus retry budget). Any of these states must cause the backend to emit a `GuardianFailure` notification to the client (via WebSocket) and to Telegram. The frontend treats `GuardianFailure` as a boolean state per attack_id — it does not try to determine failure reasons itself.

  1. **Immediately send a Telegram alert:** "⚠️ Guardian failed to reveal [hex]. Deadline: [absolute UK time]. Reveal manually NOW. [Open Game]" — distinct formatting from normal alerts (use ⚠️ prefix, different from standard attack notifications).
  2. **Show a red "Guardian Failed" badge on the attacked hex** in the UI, visible at all zoom levels. This replaces the normal attack countdown indicator.
  3. **Surface manual reveal CTA immediately** — the Reveals Due screen should show guardian-failed hexes at the very top with a red highlight and "Manual reveal required" label.
  4. **Log the failure** in the backend with: hex_id, attack_id, failure reason, timestamp, retry count. Surface guardian reliability stats to the player: "Guardian: 47/48 reveals successful (98%)."
  5. **Retry logic:** Guardian should retry failed reveals up to 3 times with exponential backoff (5s, 30s, 2min). If all retries fail, escalate to Telegram alert. Never silently give up.

  **Spec section:** Expand 5.2.5.1 (Guardian service), add to 4.3 (backend services)

- 🔧 **`AttackResolved` event must include `guardian_reveal` flag.** The event payload needs a boolean indicating whether the reveal was submitted by the guardian service vs the player directly. This allows the battle report to show "Revealed by guardian" and the failure flow to distinguish "guardian tried and failed" from "player never set up guardian."

  **Spec section:** 3.3.12 (event payload), 4.3

### Acceptance criteria (MVP)

1. When guardian fails to reveal, Telegram alert sent within 60 seconds of failure with ⚠️ prefix, hex name, and absolute deadline.
2. "Guardian Failed" red badge visible on the attacked hex in-app.
3. Reveals Due screen shows guardian-failed hexes at top with red highlight.
4. Guardian retries up to 3 times before escalating.
5. **Smoke test:** Guardian service is temporarily unable to reach RPC. Player has one attack pending with guardian enabled. Guardian fails 3 times, sends Telegram alert, player opens app and sees red badge, completes manual reveal successfully.

---



If the frontend ships with nothing else beyond basic game mechanics, it must ship with these three features. They address the three most likely churn events and together stop an estimated 80% of preventable rage-quits.

### Non-Negotiable 1: Reveals Due Screen + Batch Reveal + Reminders

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

### Non-Negotiable 2: Battle Report Clarity

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

### Non-Negotiable 3: Orders Panel

**What it is:** A persistent, always-visible panel on the main game screen that tells the player exactly what to do next, prioritised by urgency: reveals due, garrisons to recommit, theatres to contest, landmarks at risk, suggested targets, daily contract progress.

**Why it's non-negotiable:** Solvasion is an async game where players check in a few times a day. Each session needs to start with a clear answer to "what happened while I was away, and what should I do now?" Without this, players open the map, see a hex grid, feel overwhelmed, and close the app. The Orders panel is the difference between "I don't know what to do" and "I have 3 things to do and 20 minutes to do them."

**Acceptance criteria:**
1. Visible on main game screen without navigation
2. Items sorted by urgency (reveals > recommits > theatres > landmarks > targets > contracts)
3. Each item links directly to the relevant action screen
4. Updates in real-time via WebSocket
5. Empty state: encouraging copy, not blank space
6. **Smoke test:** Player logs in after 12h offline. Panel lists: (1) 2 reveals due with countdowns, (2) 1 garrison to recommit, (3) 1 active theatre. Clicking each navigates to the correct action screen.

---

## Summary of New Spec Additions

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

### Contract Requirements (blocks frontend if missing)

These are data and event contracts that must be agreed between program, backend, and frontend before implementation begins. They're promoted from "implicit" to explicit because they're the most common source of "frontend blocked waiting on backend" delays.

| Contract | Owner | Consumer | What must be defined |
|----------|-------|----------|---------------------|
| `AttackResolved` event payload | Program (on-chain) | Indexer → Backend → Frontend | `attacker_committed`, `defender_revealed` (0 on timeout), outcome enum, surplus/refund amounts, `cooldown_end` timestamp, `guardian_reveal` boolean |
| `GuardianFailure` notification | Guardian service (backend) | WebSocket → Frontend, Telegram | `attack_id`, `hex_id`, failure reason enum, timestamp. Emitted when any guardian failure trigger condition is met. Frontend treats as boolean per `attack_id`. |
| Battle report storage | Backend DB | Frontend (via REST, attack history) | Stored per `attack_id`. Must include all `AttackResolved` fields plus `guardian_reveal`. Queryable by player wallet. |
