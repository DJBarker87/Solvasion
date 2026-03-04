import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";

export function registerPlayerRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/seasons/:id/leaderboard", async (req) => {
    const stmts = preparedStatements(getDb());
    const seasonId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt((req.query as any).limit ?? "50", 10), 200);
    const players = stmts.getLeaderboard.all(seasonId, limit);
    return { players };
  });

  app.get<{ Params: { id: string; wallet: string } }>(
    "/api/seasons/:id/players/:wallet",
    async (req) => {
      const stmts = preparedStatements(getDb());
      const seasonId = parseInt(req.params.id, 10);
      const player = stmts.getPlayer.get(seasonId, req.params.wallet);
      if (!player) return { error: "Player not found", statusCode: 404 };

      const hexes = stmts.getPlayerHexes.all(seasonId, req.params.wallet);
      return { player, hexes };
    }
  );
}
