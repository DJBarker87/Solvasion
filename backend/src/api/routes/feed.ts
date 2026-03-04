import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";

export function registerFeedRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/seasons/:id/feed", async (req) => {
    const stmts = preparedStatements(getDb());
    const seasonId = parseInt(req.params.id, 10);
    const query = req.query as any;
    const since = parseInt(query.since ?? "0", 10);
    const limit = Math.min(parseInt(query.limit ?? "50", 10), 200);

    if (since > 0) {
      const items = stmts.getWarFeed.all(seasonId, since, limit);
      return { feed: items };
    } else {
      const items = stmts.getWarFeedLatest.all(seasonId, limit);
      return { feed: items.reverse() }; // Return in chronological order
    }
  });
}
