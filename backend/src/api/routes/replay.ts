import type { FastifyInstance } from "fastify";
import { getDb, preparedStatements } from "../../db.js";

export function registerReplayRoutes(app: FastifyInstance) {
  // GET /api/seasons/:id/replay
  // Returns chronological hex ownership changes for replay
  app.get<{ Params: { id: string } }>("/api/seasons/:id/replay", async (req, reply) => {
    const seasonId = Number(req.params.id);
    if (!seasonId || isNaN(seasonId)) {
      return reply.status(400).send({ error: "Invalid season ID" });
    }

    const db = getDb();
    const stmts = preparedStatements(db);

    // Check season exists
    const season = stmts.getSeason.get(seasonId) as Record<string, unknown> | undefined;
    if (!season) {
      return reply.status(404).send({ error: "Season not found" });
    }

    // Get all hex ownership change events in chronological order
    const events = db.prepare(`
      SELECT
        wf.created_at as t,
        wf.hex_id as h,
        wf.event_type as type,
        wf.involved_players as players,
        wf.message as msg
      FROM war_feed wf
      WHERE wf.season_id = ?
        AND wf.event_type IN ('HexClaimed', 'AttackResolved', 'PhaseChanged')
      ORDER BY wf.created_at ASC, wf.feed_id ASC
    `).all(seasonId) as Array<{
      t: number;
      h: string | null;
      type: string;
      players: string | null;
      msg: string;
    }>;

    // Transform into compact replay format
    const replay = events.map(e => {
      if (e.type === 'PhaseChanged') {
        return { t: e.t, type: 'phase', msg: e.msg };
      }

      const players = e.players ? JSON.parse(e.players) as string[] : [];

      if (e.type === 'HexClaimed') {
        return { t: e.t, h: e.h, type: 'claim', to: players[0] ?? null };
      }

      // AttackResolved — determine if ownership changed from message
      const captured = e.msg?.includes('captured');
      if (captured && players.length >= 2) {
        return { t: e.t, h: e.h, type: 'capture', from: players[1], to: players[0] };
      }

      // Defended or other
      return { t: e.t, h: e.h, type: 'defend', attacker: players[0], defender: players[1] };
    });

    // Cache immutable data for ended seasons
    if (season.actual_end || season.phase === 'Ended') {
      reply.header('Cache-Control', 'public, max-age=86400');
    }

    return { season_id: seasonId, events: replay };
  });
}
