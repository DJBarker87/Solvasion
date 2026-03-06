import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";
import { cacheGet, cacheSet } from "../../utils/cache.js";

export function registerSeasonRoutes(app: FastifyInstance) {
  app.get("/api/seasons", async () => {
    const cached = cacheGet<unknown>("seasons:all");
    if (cached) return cached;
    const stmts = preparedStatements(getDb());
    const seasons = stmts.getAllSeasons.all();
    const result = { seasons };
    cacheSet("seasons:all", result, 30_000); // 30s TTL
    return result;
  });

  app.get<{ Params: { id: string } }>("/api/seasons/:id", async (req) => {
    const seasonId = parseInt(req.params.id, 10);
    const cacheKey = `seasons:${seasonId}`;
    const cached = cacheGet<unknown>(cacheKey);
    if (cached) return cached;
    const stmts = preparedStatements(getDb());
    const season = stmts.getSeason.get(seasonId);
    if (!season) return { error: "Season not found", statusCode: 404 };

    const regions = stmts.getSeasonRegions.all(seasonId);
    const result = { season, regions };
    cacheSet(cacheKey, result, 60_000); // 60s TTL
    return result;
  });
}
