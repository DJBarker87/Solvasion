import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";

export function registerSeasonRoutes(app: FastifyInstance) {
  app.get("/api/seasons", async () => {
    const stmts = preparedStatements(getDb());
    const seasons = stmts.getAllSeasons.all();
    return { seasons };
  });

  app.get<{ Params: { id: string } }>("/api/seasons/:id", async (req) => {
    const stmts = preparedStatements(getDb());
    const seasonId = parseInt(req.params.id, 10);
    const season = stmts.getSeason.get(seasonId);
    if (!season) return { error: "Season not found", statusCode: 404 };

    const regions = stmts.getSeasonRegions.all(seasonId);
    return { season, regions };
  });
}
