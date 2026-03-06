import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";
import { validateWallet } from "../../utils/validate.js";
import { cacheGet, cacheSet } from "../../utils/cache.js";

export function registerPlayerRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/seasons/:id/leaderboard", async (req) => {
    const seasonId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt((req.query as any).limit ?? "50", 10), 200);
    const cacheKey = `leaderboard:${seasonId}:${limit}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) return cached;
    const stmts = preparedStatements(getDb());
    const players = stmts.getLeaderboard.all(seasonId, limit);
    const result = { players };
    cacheSet(cacheKey, result, 15_000); // 15s TTL
    return result;
  });

  app.get<{ Params: { id: string; wallet: string } }>(
    "/api/seasons/:id/players/:wallet",
    async (req, reply) => {
      if (!validateWallet(req.params.wallet)) {
        return reply.status(400).send({ error: "Invalid wallet address" });
      }
      const stmts = preparedStatements(getDb());
      const seasonId = parseInt(req.params.id, 10);
      const player = stmts.getPlayer.get(seasonId, req.params.wallet);
      if (!player) return { error: "Player not found", statusCode: 404 };

      const hexes = stmts.getPlayerHexes.all(seasonId, req.params.wallet);
      return { player, hexes };
    }
  );
}
