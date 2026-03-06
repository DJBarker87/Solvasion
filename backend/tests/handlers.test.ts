import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleEvent } from "../src/indexer/handlers.js";
import { initDb } from "../src/db.js";
import type { Statements } from "../src/db.js";

// Mock statements — track calls while delegating transaction() to real DB
function createMockStatements(): Statements & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const handler = {
    get(_target: unknown, prop: string) {
      if (prop === "calls") return calls;
      if (!calls[prop]) calls[prop] = [];
      return {
        run(...args: unknown[]) { calls[prop].push(args); },
        get(...args: unknown[]) {
          calls[prop].push(args);
          // Return mock season for PlayerJoined
          if (prop === "getSeason") return { player_count: 3, total_hexes: 100 };
          // Return mock hex for AttackResolved / hexLabel
          if (prop === "getHex") return { is_landmark: 0, name: null };
          return null;
        },
        all(...args: unknown[]) {
          calls[prop].push(args);
          // Return empty bot list
          if (prop === "getAllBotStates") return [];
          return [];
        },
      };
    },
  };
  return new Proxy({}, handler) as Statements & { calls: Record<string, unknown[][]> };
}

describe("Event Handlers", () => {
  let stmts: Statements & { calls: Record<string, unknown[][]> };

  before(() => {
    // Initialize in-memory DB so getDb().transaction() works
    process.env.DB_PATH = ":memory:";
    initDb();
  });

  beforeEach(() => {
    stmts = createMockStatements();
  });

  describe("HexClaimed", () => {
    it("should upsert hex and update player hex count", () => {
      handleEvent("HexClaimed", {
        seasonId: 1,
        hexId: 12345,
        player: "ABC123wallet",
        isLandmark: false,
      }, stmts, "tx1");

      assert.ok(stmts.calls.updateHexClaimed, "should call updateHexClaimed");
      assert.ok(stmts.calls.updatePlayerHexCount, "should call updatePlayerHexCount");
      assert.ok(stmts.calls.insertWarFeed, "should insert war feed entry");
    });

    it("should handle landmark hexes", () => {
      handleEvent("HexClaimed", {
        seasonId: 1,
        hexId: 99999,
        player: "DEF456wallet",
        isLandmark: true,
      }, stmts, "tx2");

      const hexArgs = stmts.calls.updateHexClaimed[0][0] as Record<string, unknown>;
      assert.equal(hexArgs.is_landmark, 1);
    });
  });

  describe("AttackLaunched", () => {
    it("should insert attack and update hex under_attack", () => {
      handleEvent("AttackLaunched", {
        seasonId: 1,
        attackId: 1,
        attacker: "attacker_wallet",
        defender: "defender_wallet",
        targetHex: 555,
        energy: 30,
        deadline: Math.floor(Date.now() / 1000) + 14400,
      }, stmts, "tx3");

      assert.ok(stmts.calls.insertAttack, "should call insertAttack");
      assert.ok(stmts.calls.updateHexUnderAttack, "should mark hex under attack");
      assert.ok(stmts.calls.updatePlayerAttackStats, "should update attacker stats");
      assert.ok(stmts.calls.insertWarFeed, "should insert war feed");
    });
  });

  describe("AttackResolved", () => {
    it("should handle attacker win (outcome 0)", () => {
      handleEvent("AttackResolved", {
        seasonId: 1,
        attackId: 1,
        hexId: 555,
        attacker: "attacker_wallet",
        defender: "defender_wallet",
        outcome: 0,
        attackerCommitted: 30,
        defenderRevealed: 20,
        attackerSurplusReturned: 10,
        attackerRefund: 0,
        guardianReveal: false,
      }, stmts, "tx4");

      assert.ok(stmts.calls.updateAttackResolved);
      assert.ok(stmts.calls.updateHexOwner, "should transfer hex to attacker");
      assert.ok(stmts.calls.updatePlayerAttackWin, "should increment attacker wins");
    });

    it("should handle defender win (outcome 1)", () => {
      handleEvent("AttackResolved", {
        seasonId: 1,
        attackId: 2,
        hexId: 555,
        attacker: "attacker_wallet",
        defender: "defender_wallet",
        outcome: 1,
        attackerCommitted: 20,
        defenderRevealed: 30,
        attackerSurplusReturned: 0,
        attackerRefund: 0,
        guardianReveal: false,
      }, stmts, "tx5");

      assert.ok(stmts.calls.updatePlayerDefenceWin, "should increment defender wins");
      assert.ok(!stmts.calls.updateHexOwner, "should NOT transfer hex");
    });

    it("should handle timeout (outcome 2)", () => {
      handleEvent("AttackResolved", {
        seasonId: 1,
        attackId: 3,
        hexId: 555,
        attacker: "attacker_wallet",
        defender: "defender_wallet",
        outcome: 2,
        attackerCommitted: 25,
        defenderRevealed: 0,
        attackerSurplusReturned: 0,
        attackerRefund: 0,
        guardianReveal: false,
      }, stmts, "tx6");

      assert.ok(stmts.calls.updateHexOwner, "should transfer hex on timeout");
    });
  });

  describe("DefenceIncreased", () => {
    it("should update player energy and hex commitment", () => {
      handleEvent("DefenceIncreased", {
        seasonId: 1,
        player: "wallet123",
        hexId: 777,
        delta: 15,
      }, stmts, "tx7");

      assert.ok(stmts.calls.updatePlayerEnergy);
      assert.ok(stmts.calls.updateHexCommitment);
    });
  });

  describe("PlayerJoined", () => {
    it("should insert player and update season counters", () => {
      handleEvent("PlayerJoined", {
        seasonId: 1,
        player: "new_player",
        startingEnergy: 100,
        joinedAt: 1700000000,
      }, stmts, "tx8");

      assert.ok(stmts.calls.insertPlayer);
      assert.ok(stmts.calls.getSeason);
      assert.ok(stmts.calls.updateSeasonCounters);
      assert.ok(stmts.calls.insertWarFeed);
    });
  });

  describe("DefenceWithdrawn", () => {
    it("should clear commitment and reduce player energy", () => {
      handleEvent("DefenceWithdrawn", {
        seasonId: 1,
        player: "wallet_abc",
        hexId: 888,
        energyAmount: 25,
      }, stmts, "tx9");

      assert.ok(stmts.calls.updateHexCommitment);
      assert.ok(stmts.calls.updatePlayerEnergy);
    });
  });

  describe("Unknown event", () => {
    it("should silently skip unknown events", () => {
      handleEvent("SomeUnknownEvent", { foo: "bar" }, stmts, "txX");
      // No crash = pass
      assert.ok(true);
    });
  });

  describe("SeasonCreated", () => {
    it("should upsert season and add war feed", () => {
      handleEvent("SeasonCreated", {
        seasonId: 2,
        startTime: 1700000000,
        endTime: 1702000000,
      }, stmts, "tx10");

      assert.ok(stmts.calls.upsertSeason);
      assert.ok(stmts.calls.insertWarFeed);
    });
  });

  describe("PhaseChanged", () => {
    it("should update phase to War", () => {
      handleEvent("PhaseChanged", {
        seasonId: 1,
        newPhase: 1,
      }, stmts, "tx11");

      assert.ok(stmts.calls.updateSeasonPhase);
      const args = stmts.calls.updateSeasonPhase[0][0] as Record<string, unknown>;
      assert.equal(args.phase, "War");
    });
  });
});
