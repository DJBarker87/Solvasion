# Solvasion

**A fully on-chain territory conquest game on Solana.**

Players battle over a hexagonal grid overlaid on a real map of Europe. Hidden defence allocations use Pedersen commitments on Ristretto255 — you can see the entire map, but never how strong any position really is. Every game action is a Solana transaction. The on-chain program is authoritative over all game outcomes.

Free to play. No token. No entry fees. Players pay only Solana rent deposits (refunded at season end) and negligible transaction fees.

---

## How It Works

### The Map
The game uses [H3 hexagonal indexing](https://h3geo.org/) at resolution 3, producing a grid of ~251 hexes across Western Europe (Season 1) or ~693 hexes for the full European theatre. Landmarks like Paris, London, and Rome grant bonus energy generation. Bridge edges connect islands via sea crossings (English Channel, Irish Sea, Strait of Messina).

### Seasons
Each season runs up to 28 days across five phases:

| Phase | What Happens |
|-------|-------------|
| **Land Rush** | Claim territory freely. No attacks allowed. Build your garrison in secret. |
| **War** | Attacks enabled. Launch assaults on neighbours, defend your hexes, earn points from territory. |
| **Escalation Stage 1** | Minimum attack costs increase. Energy generation shifts. Pressure builds. |
| **Escalation Stage 2** | Landmark multipliers activate. Final push for victory. |
| **Ended** | First to the victory threshold wins. Season finalised and recorded permanently on-chain. |

### Hidden Garrisons (Pedersen Commitments)
Defence allocations are hidden using **Pedersen commitments** on the Ristretto255 curve. When you garrison a hex, you commit energy via `C = amount * G + blind * H` — the chain stores only the opaque commitment. Nobody knows how much energy you've committed until you reveal during combat.

Verification uses Solana's native `curve25519` syscalls at ~5,000 compute units — cheaper than SHA256 hashing.

### Combat
1. **Attacker** launches an assault from an adjacent hex, committing energy
2. **Defender** has a time window to reveal their garrison (or let the Guardian auto-reveal)
3. **Resolution**: If `attacker_energy > defender_energy * (1 + fortification_bonus)`, attacker wins. Ties go to defender.
4. **Aftermath**: Defence commitment is always consumed — defender must re-garrison after every battle

### Energy
Energy is the single resource. It generates passively from owned territory (more hexes = more energy), caps at 500, and is spent on claiming hexes, garrisoning, and attacking. No tokens, no secondary currencies.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Frontend (React + TypeScript + Mapbox GL)            │
│ H3 hex overlay, wallet-adapter, client-side          │
│ Ristretto255 Pedersen commitment generation          │
└──────────────────┬──────────────────────────────────┘
                   │ RPC + WebSocket
┌──────────────────▼──────────────────────────────────┐
│ Solana Program (Anchor, Rust)                        │
│ 27 instructions, 11 account types, ~5K CU Pedersen   │
│ verification via solana-curve25519 syscalls           │
└──────────────────┬──────────────────────────────────┘
                   │ Events (28 event types)
┌──────────────────▼──────────────────────────────────┐
│ Backend (Node.js + Fastify + SQLite)                 │
│ Event indexer, REST API (12 endpoints), WebSocket,   │
│ crank (timeouts/cleanup), bot controller (3 NPCs),   │
│ Guardian auto-reveal, Telegram notifications         │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| On-chain program | Rust + [Anchor](https://www.anchor-lang.com/) 0.32.1 |
| Cryptography (on-chain) | `solana-curve25519` — Ristretto255 MSM syscalls |
| Cryptography (client) | [`@noble/curves`](https://github.com/paulmillr/noble-curves) — Ristretto255 commitments |
| Frontend | React 19, TypeScript, Tailwind CSS, [Mapbox GL JS](https://www.mapbox.com/mapbox-gljs), [h3-js](https://github.com/uber/h3-js) |
| Wallet | `@solana/wallet-adapter` — Phantom, Solflare, Backpack |
| Backend | Node.js, [Fastify](https://fastify.dev/) 5, SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) |
| Hex grid | [H3](https://h3geo.org/) resolution 3, Natural Earth 50m boundaries |
| Notifications | Telegram Bot API (opt-in attack alerts) |
| Build | Vite 7, `tsc` strict mode |

---

## On-Chain Program

**Program ID (devnet):** `98VnxqEX7SBwLGJVAVeLSfQPEUDGwBEpQWwugvjPeAfM`

### Account Types (11)

| Account | Purpose | Lifecycle |
|---------|---------|-----------|
| GlobalConfig | Admin settings, season counter | Permanent |
| Season | All season parameters and timing | Permanent record |
| SeasonCounters | Mutable counters (player count, attack IDs) | Closed at season end |
| Player | Energy, territory, points, stats, shield, guardian | Closed at season end |
| Hex | Owner, defence commitment, combat state | Closed at season end |
| Attack | Attacker/defender, energy, deadline, result | Closed on resolution |
| ValidHexSet | Binary-searchable set of valid hex IDs | Closed at season end |
| AdjacencySet | Binary-searchable edge list | Closed at season end |
| Reputation | Cross-season permanent stats | Permanent |
| PhantomRecovery | Energy recovery after timeout losses | Closed on recovery |
| Pact | Non-aggression agreements between players | Closed on break/expiry |

### Instructions (27)

**Setup:** `initialize`, `create_season`, `init_valid_hexes`, `append_hex_data`, `init_adjacency`, `append_adjacency_data`, `finalize_map_data`

**Player:** `join_season`, `set_banner`, `set_shield`, `set_posture`, `set_guardian`, `clear_guardian`, `propose_pact`, `accept_pact`

**Territory & Defence:** `claim_hex`, `commit_defence`, `increase_defence`, `withdraw_defence`, `recommit_defence`, `batch_recommit_defence`

**Combat:** `launch_attack`, `reveal_defence`, `resolve_timeout`

**Season End:** `end_season`, `claim_victory`, `finalize_chunk`, `finalize_complete`, `update_reputation`, `close_season_hex`, `close_season_player`, `recover_phantom_energy`, `batch_recover_phantom`, `clear_phantom_energy`

---

## Backend

The backend is a **read-only event indexer** — it caches on-chain state for fast queries but never writes game state. The on-chain program is always authoritative.

### Services

| Service | Purpose |
|---------|---------|
| **Event Indexer** | Streams program logs via WebSocket, parses Anchor events, updates SQLite |
| **REST API** | 12 endpoints for seasons, map, leaderboard, player stats, war feed, reputation |
| **WebSocket** | Real-time event broadcast with cursor-based resume |
| **Crank** | Resolves timeouts (30s), reconciles state (2min), finalises seasons (5min) |
| **Guardian** | Stores encrypted reveal packets, auto-reveals when player is attacked |
| **Bot Controller** | 3 NPC bots (Centurion, Vanguard, Sentinel) with distinct personalities |
| **Telegram** | Opt-in attack alerts, incursion warnings, daily briefings |
| **Contracts** | Daily challenge quests (capture landmarks, defend hexes, etc.) |

### API Endpoints

```
GET  /api/seasons                          # List all seasons
GET  /api/seasons/:id                      # Season details + regions
GET  /api/seasons/:id/map                  # All hex states
GET  /api/seasons/:id/leaderboard          # Top players by points
GET  /api/seasons/:id/players/:wallet      # Player stats + hex list
GET  /api/seasons/:id/attacks              # Recent attacks
GET  /api/seasons/:id/attacks/pending/:w   # Incoming attacks for player
GET  /api/seasons/:id/feed                 # War feed (cursor-paginated)
GET  /api/reputation/:wallet              # Cross-season reputation
POST /api/guardian/packets                 # Upload encrypted reveal packet
```

---

## Frontend

### Features
- **Interactive Map** — Mapbox GL with H3 hex overlay, click-to-select, fog-of-war
- **Garrison Management** — Set, increase, or withdraw hidden defences via Pedersen commitments
- **Attack Flow** — Select target, choose origin hex, commit energy, await resolution
- **Battle Reports** — Modal showing combat outcomes with energy comparisons
- **War Feed** — Real-time event log (attacks, captures, defences) colour-coded by type
- **Leaderboard** — Live rankings by victory points
- **Guardian Toggle** — Opt-in auto-reveal service for when you're offline
- **Replay Mode** — View completed seasons via `#replay/{seasonId}`
- **Incoming Attack Alerts** — Banner prompts for pending attacks requiring reveal

### Client-Side Cryptography
All Pedersen commitments are generated in the browser using `@noble/curves`. Blinding factors are stored in `localStorage` — if cleared, garrisons cannot be revealed. The backend never sees defence amounts or blinding factors.

---

## Game Mechanics Highlights

- **Fortification Bonus** — The longer you hold a hex, the stronger your defence (up to 50% bonus)
- **Shield Windows** — 6-hour UTC windows that extend attack deadlines (changeable with 24h delay)
- **Retaliation Tokens** — After defending successfully, get a discount on counter-attacks
- **Phantom Energy** — Energy lost to timeouts can be recovered 24 hours later
- **Comeback Burst** — One-time energy grant if you drop from your peak territory count
- **Theatre System** — Admin-activated regional bonuses for dynamic mid-season events
- **Pacts** — Non-aggression agreements with point penalties for breaking them
- **Clutch Defence** — Bonus points for revealing in the final seconds of a deadline

---

## Project Structure

```
solvasion/
├── programs/solvasion/src/          # On-chain Anchor program (Rust)
│   ├── lib.rs                       # Program entrypoint
│   ├── state/                       # 11 account structs
│   ├── instructions/                # 27 instruction handlers
│   ├── crypto.rs                    # Pedersen helpers + generator constants
│   ├── helpers.rs                   # Energy/points calculation, phase logic
│   ├── errors.rs                    # 55 error codes
│   └── events.rs                    # 28 event structs
├── backend/src/                     # Node.js backend
│   ├── indexer/                     # Event streaming + 28 handlers
│   ├── crank/                       # Timeouts, reconciliation, finalization
│   ├── api/                         # Fastify REST + WebSocket
│   ├── guardian/                    # Auto-reveal service
│   ├── bots/                        # 3 NPC bots with strategies
│   └── telegram/                    # Notification service
├── frontend/src/                    # React app
│   ├── components/                  # Map, Sidebar, Modals, Action bars
│   ├── hooks/                       # 8 custom hooks (data fetching, WS, actions)
│   ├── solana/                      # PDA helpers, crypto, defence ledger
│   └── utils/                       # Map data, GeoJSON, hex colours
├── scripts/                         # Map generation, test season setup, E2E tests
├── docs/                            # Design specification (canonical)
└── tests/                           # 33 Anchor integration tests (all passing)
```

---

## Running Locally

### Prerequisites
- Solana CLI 3.0.x (Agave)
- Anchor CLI 0.32.x (via AVM)
- Node.js 18+
- Mapbox API token

### Backend
```bash
cd backend
npm install
cp .env.example .env   # Configure RPC_URL, CRANK_KEYPAIR_PATH, etc.
npm run dev
```

### Frontend
```bash
cd frontend
npm install
# Set VITE_MAPBOX_TOKEN, VITE_API_URL, VITE_RPC_URL in .env
npm run dev
```

### Tests
```bash
# Against deployed devnet program
anchor test --skip-build --skip-deploy
```

---

## Design Specification

The full game design specification is in [`docs/Solvasion_Design_Specification_v1_7_5.md`](docs/Solvasion_Design_Specification_v1_7_5.md). This is the single source of truth for all game mechanics, account structures, instruction logic, and UX requirements.

---

## Status

- [x] Pedersen commitment feasibility (benchmarked: 4,997 CU on devnet)
- [x] H3 map generation (251 hexes, Season 1 "Western Theatre")
- [x] On-chain program (27 instructions, deployed to devnet)
- [x] Integration tests (33 tests, all passing)
- [x] Backend MVP (indexer, crank, API, Guardian, bots, Telegram)
- [x] Frontend (map, game flows, real-time updates, garrison UI)
- [ ] End-to-end testing & security review
- [ ] Mainnet deployment & Season 1

---

## Author

Built by Dom ([@DJBarker87](https://github.com/DJBarker87)) — a maths teacher who ships production apps with Claude.

## License

All rights reserved.
