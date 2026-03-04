import { Logs, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import { config } from "../config.js";
import { getConnection, idl } from "../solana.js";
import { getDb, preparedStatements, type Statements } from "../db.js";
import { handleEvent } from "./handlers.js";
import { logger } from "../utils/logger.js";
import { broadcast } from "../api/ws.js";

let subscriptionId: number | null = null;
let stmts: Statements;

export function startIndexer() {
  const conn = getConnection();
  const db = getDb();
  stmts = preparedStatements(db);

  const coder = new BorshCoder(idl);
  const eventParser = new EventParser(config.programId, coder);

  logger.info("Starting event indexer...");

  subscriptionId = conn.onLogs(
    config.programId,
    (logs: Logs) => {
      if (logs.err) return; // Skip failed transactions

      try {
        const events = eventParser.parseLogs(logs.logs);
        for (const event of events) {
          processEvent(event.name, event.data, logs.signature);
        }
      } catch (err) {
        logger.error("Failed to parse logs", {
          signature: logs.signature,
          error: String(err),
        });
      }
    },
    config.commitment
  );

  logger.info(`Subscribed to program logs (subscription: ${subscriptionId})`);
}

function processEvent(eventName: string, data: any, txSignature: string) {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  // Extract season_id from event data (most events have it)
  // Anchor 0.32 IDL uses snake_case field names, so check both
  const rawSeasonId = data.seasonId ?? data.season_id ?? null;
  const seasonId = rawSeasonId?.toNumber?.() ?? rawSeasonId;

  // Dedup: check if we've already processed this event
  const existing = stmts.insertEvent.run({
    season_id: seasonId,
    event_type: eventName,
    payload: JSON.stringify(data, bigintReplacer),
    tx_signature: txSignature,
    slot: 0, // We don't have slot from onLogs — reconciliation fills it
    created_at: now,
  });

  if (existing.changes === 0) {
    logger.debug(`Skipping duplicate event: ${eventName} in ${txSignature}`);
    return;
  }

  logger.info(`Event: ${eventName}`, { tx: txSignature, seasonId });

  // Dispatch to handler
  try {
    handleEvent(eventName, data, stmts, txSignature);
  } catch (err) {
    logger.error(`Handler failed for ${eventName}`, {
      error: String(err),
      tx: txSignature,
    });
  }

  // Broadcast to WebSocket subscribers
  if (seasonId != null) {
    broadcast(seasonId, {
      event_id: Number(existing.lastInsertRowid),
      event: eventName,
      data: JSON.parse(JSON.stringify(data, bigintReplacer)),
      tx: txSignature,
      timestamp: now,
    });
  }
}

export function stopIndexer() {
  if (subscriptionId !== null) {
    const conn = getConnection();
    conn.removeOnLogsListener(subscriptionId);
    subscriptionId = null;
    logger.info("Indexer stopped");
  }
}

// Handle BN and BigInt serialization
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as any).toNumber();
  }
  return value;
}
