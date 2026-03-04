import type { FastifyInstance } from "fastify";
import type WebSocket from "ws";
import { getDb, preparedStatements } from "../db.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

interface Subscriber {
  ws: WebSocket;
  seasonId: number;
  wallet?: string;
}

// Season ID → Set of subscribers
const subscribers = new Map<number, Set<Subscriber>>();

export function registerWebSocket(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, req) => {
    let sub: Subscriber | null = null;

    socket.on("message", (raw: any) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.season_id != null) {
          // Subscribe to a season
          const seasonId = parseInt(msg.season_id, 10);
          if (isNaN(seasonId)) {
            socket.send(JSON.stringify({ error: "Invalid season_id" }));
            return;
          }

          // Remove from previous subscription
          if (sub) {
            removeSub(sub);
          }

          sub = { ws: socket, seasonId, wallet: msg.wallet };
          if (!subscribers.has(seasonId)) {
            subscribers.set(seasonId, new Set());
          }
          subscribers.get(seasonId)!.add(sub);

          socket.send(JSON.stringify({ subscribed: seasonId }));
          logger.debug(`WS subscribed to season ${seasonId}`);

          // Handle cursor-based replay
          if (msg.resume_from != null) {
            replayEvents(socket, seasonId, parseInt(msg.resume_from, 10));
          }
        }
      } catch {
        socket.send(JSON.stringify({ error: "Invalid JSON" }));
      }
    });

    socket.on("close", () => {
      if (sub) removeSub(sub);
    });

    socket.on("error", () => {
      if (sub) removeSub(sub);
    });

    // Keepalive ping
    const pingTimer = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping();
      } else {
        clearInterval(pingTimer);
      }
    }, config.wsPingInterval);

    socket.on("close", () => clearInterval(pingTimer));
  });
}

function removeSub(sub: Subscriber) {
  const subs = subscribers.get(sub.seasonId);
  if (subs) {
    subs.delete(sub);
    if (subs.size === 0) subscribers.delete(sub.seasonId);
  }
}

function replayEvents(ws: WebSocket, seasonId: number, sinceEventId: number) {
  const stmts = preparedStatements(getDb());
  const events = stmts.getEventsSince.all(seasonId, sinceEventId, config.wsMaxReplayEvents) as any[];

  if (events.length >= config.wsMaxReplayEvents) {
    ws.send(JSON.stringify({ full_sync_required: true }));
    return;
  }

  for (const event of events) {
    ws.send(JSON.stringify({
      event_id: event.event_id,
      event: event.event_type,
      data: JSON.parse(event.payload),
      tx: event.tx_signature,
      timestamp: event.created_at,
      replay: true,
    }));
  }

  ws.send(JSON.stringify({ replay_complete: true, events_sent: events.length }));
}

/**
 * Broadcast an event to all WebSocket subscribers for a season.
 * Called from the indexer when a new event is processed.
 */
export function broadcast(seasonId: number, payload: Record<string, unknown>) {
  const subs = subscribers.get(seasonId);
  if (!subs || subs.size === 0) return;

  const msg = JSON.stringify(payload);
  for (const sub of subs) {
    if (sub.ws.readyState === sub.ws.OPEN) {
      sub.ws.send(msg);
    }
  }
}
