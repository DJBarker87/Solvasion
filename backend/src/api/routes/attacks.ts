import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";
import { validateWallet } from "../../utils/validate.js";

export function registerAttackRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/seasons/:id/attacks", async (req) => {
    const stmts = preparedStatements(getDb());
    const seasonId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt((req.query as any).limit ?? "50", 10), 200);
    const attacks = stmts.getSeasonAttacks.all(seasonId, limit);
    return { attacks };
  });

  app.get<{ Params: { id: string; wallet: string } }>(
    "/api/seasons/:id/attacks/pending/:wallet",
    async (req, reply) => {
      const wallet = req.params.wallet;
      if (!validateWallet(wallet)) {
        return reply.status(400).send({ error: "Invalid wallet address" });
      }
      const stmts = preparedStatements(getDb());
      const seasonId = parseInt(req.params.id, 10);
      const attacks = stmts.getPendingAttacksForWallet.all(seasonId, wallet);
      return { attacks };
    }
  );
}
