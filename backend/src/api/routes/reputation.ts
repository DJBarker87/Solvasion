import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";
import { validateWallet } from "../../utils/validate.js";

export function registerReputationRoutes(app: FastifyInstance) {
  app.get<{ Params: { wallet: string } }>("/api/reputation/:wallet", async (req, reply) => {
    const wallet = req.params.wallet;
    if (!validateWallet(wallet)) {
      return reply.status(400).send({ error: "Invalid wallet address" });
    }
    const stmts = preparedStatements(getDb());
    const rep = stmts.getReputation.get(wallet);
    if (!rep) return { error: "No reputation data", statusCode: 404 };
    return { reputation: rep };
  });
}
