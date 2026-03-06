import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";

export function registerContractRoutes(app: FastifyInstance) {
  // Get today's contracts with progress for a wallet
  app.get<{
    Params: { seasonId: string; wallet: string };
  }>("/api/seasons/:seasonId/contracts/:wallet", async (req) => {
    const db = getDb();
    const stmts = preparedStatements(db);
    const seasonId = parseInt(req.params.seasonId, 10);
    const wallet = req.params.wallet;
    const now = Math.floor(Date.now() / 1000);

    const rows = stmts.getContractProgress.all(wallet, seasonId, now) as any[];
    return rows.map((r: any) => ({
      contract_id: r.contract_id,
      contract_type: r.contract_type,
      target_region: r.target_region,
      target_count: r.target_count,
      bonus_points: r.bonus_points,
      expires_at: r.expires_at,
      current_count: r.current_count ?? 0,
      completed: r.completed ?? 0,
    }));
  });

  // Get active pacts for a wallet
  app.get<{
    Params: { seasonId: string; wallet: string };
  }>("/api/seasons/:seasonId/pacts/:wallet", async (req) => {
    const db = getDb();
    const stmts = preparedStatements(db);
    const seasonId = parseInt(req.params.seasonId, 10);
    const wallet = req.params.wallet;
    const now = Math.floor(Date.now() / 1000);

    return stmts.getPlayerPacts.all(seasonId, wallet, wallet, now);
  });
}
