import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";

export function registerStatsRoutes(app: FastifyInstance) {
  app.get("/api/stats", async () => {
    const stmts = preparedStatements(getDb());
    const stats = stmts.getGlobalStats.get() as any;
    return {
      total_seasons: stats?.total_seasons ?? 0,
      total_players: stats?.total_players ?? 0,
      total_hexes_claimed: stats?.total_hexes_claimed ?? 0,
    };
  });
}
