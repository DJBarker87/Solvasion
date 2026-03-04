import { config } from "../config.js";
import { checkCrankBalance } from "../solana.js";
import { processTimeouts } from "./timeouts.js";
import { processFinalization } from "./finalization.js";
import { processCleanup } from "./cleanup.js";
import { reconcile } from "../indexer/reconcile.js";
import { logger } from "../utils/logger.js";

let timeoutTimer: ReturnType<typeof setInterval> | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let finalizationTimer: ReturnType<typeof setInterval> | null = null;

export async function startCrank() {
  logger.info("Starting crank...");
  await checkCrankBalance();

  // Timeout resolution — every 30s
  timeoutTimer = setInterval(async () => {
    try {
      await processTimeouts();
    } catch (err) {
      logger.error("Timeout crank error", { error: String(err) });
    }
  }, config.timeoutCheckInterval);

  // Reconciliation — every 2 min
  reconcileTimer = setInterval(async () => {
    try {
      await reconcile();
    } catch (err) {
      logger.error("Reconciliation error", { error: String(err) });
    }
  }, config.reconcileInterval);

  // Finalization + cleanup — every 5 min
  finalizationTimer = setInterval(async () => {
    try {
      await processFinalization();
      await processCleanup();
    } catch (err) {
      logger.error("Finalization/cleanup error", { error: String(err) });
    }
  }, config.finalizationInterval);

  // Run initial reconciliation
  try {
    await reconcile();
  } catch (err) {
    logger.error("Initial reconciliation failed", { error: String(err) });
  }

  logger.info("Crank started — timeout check: 30s, reconcile: 2min, finalization: 5min");
}

export function stopCrank() {
  if (timeoutTimer) clearInterval(timeoutTimer);
  if (reconcileTimer) clearInterval(reconcileTimer);
  if (finalizationTimer) clearInterval(finalizationTimer);
  timeoutTimer = null;
  reconcileTimer = null;
  finalizationTimer = null;
  logger.info("Crank stopped");
}
