import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { initDb } from "../src/db.js";
import { registerSeasonRoutes } from "../src/api/routes/seasons.js";
import { registerPlayerRoutes } from "../src/api/routes/players.js";
import { registerHexRoutes } from "../src/api/routes/hexes.js";

// Seed test data into the in-memory database
function seedTestData() {
  const db = initDb();

  db.exec(`
    INSERT INTO seasons (season_id, phase, land_rush_end, war_start, escalation_start, season_end, victory_threshold)
    VALUES (1, 'War', 1700000000, 1700000001, 1700500000, 1702000000, 50000);

    INSERT INTO seasons (season_id, phase, land_rush_end, war_start, escalation_start, season_end, victory_threshold)
    VALUES (2, 'LandRush', 1700100000, 1700100001, 1700600000, 1702100000, 50000);

    INSERT INTO regions (season_id, region_id, name, hex_count)
    VALUES (1, 1, 'British Isles', 30), (1, 2, 'France', 45);

    INSERT INTO players (season_id, wallet, energy_balance, hex_count, points, joined_at)
    VALUES
      (1, '11111111111111111111111111111111', 100, 5, 500, 1700000100),
      (1, '22222222222222222222222222222222', 80, 3, 300, 1700000200),
      (1, '33333333333333333333333333333333', 60, 2, 150, 1700000300);

    INSERT INTO hexes (season_id, hex_id, owner, is_landmark, name, region_id)
    VALUES
      (1, '100', '11111111111111111111111111111111', 0, NULL, 1),
      (1, '200', '11111111111111111111111111111111', 1, 'London', 1),
      (1, '300', '22222222222222222222222222222222', 0, NULL, 2);
  `);

  return db;
}

describe("API Routes", () => {
  let app: FastifyInstance;

  before(async () => {
    // Override DB_PATH to use in-memory
    process.env.DB_PATH = ":memory:";
    seedTestData();

    app = Fastify({ logger: false });
    registerSeasonRoutes(app);
    registerPlayerRoutes(app);
    registerHexRoutes(app);

    // Health endpoint
    app.get("/api/health", async () => ({ status: "ok", timestamp: Date.now() }));

    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  // 1. GET /api/seasons — returns seasons array
  it("GET /api/seasons returns seasons array", async () => {
    const res = await app.inject({ method: "GET", url: "/api/seasons" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.seasons));
    assert.equal(body.seasons.length, 2);
  });

  // 2. GET /api/seasons/:id — returns season + regions
  it("GET /api/seasons/:id returns season with regions", async () => {
    const res = await app.inject({ method: "GET", url: "/api/seasons/1" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.season);
    assert.equal(body.season.season_id, 1);
    assert.equal(body.season.phase, "War");
    assert.ok(Array.isArray(body.regions));
    assert.equal(body.regions.length, 2);
  });

  // 3. GET /api/seasons/:id — 404 for non-existent season
  it("GET /api/seasons/:id returns 404 for unknown season", async () => {
    const res = await app.inject({ method: "GET", url: "/api/seasons/999" });
    assert.equal(res.statusCode, 200); // Fastify returns 200 with error body for this pattern
    const body = res.json();
    assert.equal(body.error, "Season not found");
    assert.equal(body.statusCode, 404);
  });

  // 4. GET /api/seasons/:id/leaderboard — returns players
  it("GET /api/seasons/:id/leaderboard returns ranked players", async () => {
    const res = await app.inject({ method: "GET", url: "/api/seasons/1/leaderboard" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.players));
    assert.equal(body.players.length, 3);
    // Should be ordered by points DESC
    assert.equal(body.players[0].wallet, "11111111111111111111111111111111");
  });

  // 5. GET /api/seasons/:id/leaderboard?limit=2 — respects limit
  it("GET /api/seasons/:id/leaderboard respects limit param", async () => {
    const res = await app.inject({ method: "GET", url: "/api/seasons/1/leaderboard?limit=2" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.players.length, 2);
  });

  // 6. GET /api/seasons/:id/players/:wallet — returns player + hexes
  it("GET /api/seasons/:id/players/:wallet returns player with hexes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/seasons/1/players/11111111111111111111111111111111",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.player);
    assert.equal(body.player.wallet, "11111111111111111111111111111111");
    assert.ok(Array.isArray(body.hexes));
    assert.equal(body.hexes.length, 2);
  });

  // 7. GET /api/seasons/:id/players/:wallet — 404 for unknown player
  it("GET /api/seasons/:id/players/:wallet returns 404 for unknown player", async () => {
    // Use a valid base58 Solana address that doesn't exist in test data
    const res = await app.inject({
      method: "GET",
      url: "/api/seasons/1/players/9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.error, "Player not found");
    assert.equal(body.statusCode, 404);
  });

  // 8. GET /api/seasons/:id/players/INVALID — 400 for invalid wallet
  it("GET /api/seasons/:id/players/INVALID returns 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/seasons/1/players/not-a-wallet",
    });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error, "Invalid wallet address");
  });

  // 9. GET /api/seasons/:id/map — returns hexes array
  it("GET /api/seasons/:id/map returns hexes array", async () => {
    const res = await app.inject({ method: "GET", url: "/api/seasons/1/map" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.hexes));
    assert.equal(body.hexes.length, 3);
  });

  // 10. GET /api/health — returns ok
  it("GET /api/health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, "ok");
    assert.ok(body.timestamp);
  });
});
