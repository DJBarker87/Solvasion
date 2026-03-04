import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";
import { config } from "../../config.js";

export function registerHexRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/seasons/:id/map", {
    config: {
      rateLimit: {
        max: config.mapRateLimitMax,
        timeWindow: config.rateLimitWindow,
      },
    },
    handler: async (req) => {
      const stmts = preparedStatements(getDb());
      const seasonId = parseInt(req.params.id, 10);
      const hexes = stmts.getSeasonMap.all(seasonId);
      return { hexes };
    },
  });

  app.get<{ Params: { id: string; hexId: string } }>(
    "/api/seasons/:id/hex/:hexId",
    async (req) => {
      const stmts = preparedStatements(getDb());
      const seasonId = parseInt(req.params.id, 10);
      const hex = stmts.getHex.get(seasonId, req.params.hexId);
      if (!hex) return { error: "Hex not found", statusCode: 404 };
      return { hex };
    }
  );
}
