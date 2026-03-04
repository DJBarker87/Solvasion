import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";

export function registerReputationRoutes(app: FastifyInstance) {
  app.get<{ Params: { wallet: string } }>("/api/reputation/:wallet", async (req) => {
    const stmts = preparedStatements(getDb());
    const rep = stmts.getReputation.get(req.params.wallet);
    if (!rep) return { error: "No reputation data", statusCode: 404 };
    return { reputation: rep };
  });
}
