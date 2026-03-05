import { initDb } from "./db.js";
import { startIndexer, stopIndexer } from "./indexer/index.js";
import { startCrank, stopCrank } from "./crank/index.js";
import { startApi } from "./api/index.js";
import { startGuardian } from "./guardian/index.js";
import { startBots, stopBots } from "./bots/index.js";
import { fullRebuild } from "./indexer/reconcile.js";
import { logger } from "./utils/logger.js";

async function main() {
  const args = process.argv.slice(2);
  const rebuild = args.includes("--rebuild");

  logger.info("Solvasion backend starting...");
  logger.info(`CRANK_KEYPAIR_PATH env: ${process.env.CRANK_KEYPAIR_PATH ? `set (${process.env.CRANK_KEYPAIR_PATH.length} chars)` : "NOT SET"}`);

  // Initialize database
  initDb(rebuild);

  // If --rebuild, do a full on-chain state rebuild first
  if (rebuild) {
    await fullRebuild();
  }

  // Start components
  startIndexer();
  await startCrank();
  await startApi();

  // Optional services
  startGuardian();
  await startBots();

  logger.info("All systems online");

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
    stopIndexer();
    stopCrank();
    stopBots();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Fatal error", { error: String(err) });
  process.exit(1);
});
