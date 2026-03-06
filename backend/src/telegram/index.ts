import { config } from "../config.js";
import { getDb, preparedStatements } from "../db.js";
import { logger } from "../utils/logger.js";
import * as templates from "./templates.js";

// Telegram Bot API via fetch (no heavy dependency needed)
const TG_API = `https://api.telegram.org/bot${config.tgBotToken}`;

let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let lastUpdateId = 0;

// ---- Send message ----

async function sendMessage(chatId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      logger.error("Telegram sendMessage failed", { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("Telegram sendMessage error", { error: String(err) });
    return false;
  }
}

// ---- Notification API ----

export async function notifyAttack(params: {
  defenderWallet: string;
  hexName: string;
  attackerWallet: string;
  attackerEnergy: number;
  deadline: number;
}): Promise<void> {
  const sub = getSubscription(params.defenderWallet);
  if (!sub) return;

  const deadlineDate = new Date(params.deadline * 1000);
  const deadlineUtc = deadlineDate.toISOString().slice(11, 16) + " UTC";
  const remaining = params.deadline - Math.floor(Date.now() / 1000);
  const timeRemaining = formatDuration(remaining);

  await sendMessage(sub.chat_id, templates.attackAlert({
    hexName: params.hexName,
    attackerWallet: params.attackerWallet,
    attackerEnergy: params.attackerEnergy,
    deadlineUtc,
    timeRemaining,
  }));

  // Schedule countdown reminders
  scheduleReminder(sub.chat_id, params.hexName, params.deadline, 0.5);  // 50% remaining
  scheduleReminder(sub.chat_id, params.hexName, params.deadline, 1);    // 1 hour
  scheduleReminder(sub.chat_id, params.hexName, params.deadline, 0.25); // 15 min
}

export async function notifyGuardianFailure(params: {
  playerWallet: string;
  hexName: string;
  error: string;
}): Promise<void> {
  const sub = getSubscription(params.playerWallet);
  if (!sub) return;

  await sendMessage(sub.chat_id, templates.guardianFailure({
    hexName: params.hexName,
    error: params.error,
  }));
}

export async function notifyAttackResolved(params: {
  attackerWallet: string;
  defenderWallet: string;
  hexName: string;
  outcome: string;
}): Promise<void> {
  // Notify both parties
  for (const wallet of [params.attackerWallet, params.defenderWallet]) {
    const sub = getSubscription(wallet);
    if (!sub) continue;
    const isAttacker = wallet === params.attackerWallet;
    const won = (isAttacker && params.outcome !== "DefenderWins") ||
      (!isAttacker && params.outcome === "DefenderWins");
    await sendMessage(sub.chat_id, templates.attackResolved({
      hexName: params.hexName,
      outcome: params.outcome,
      won,
    }));
  }
}

export async function notifyIncursion(params: {
  factionName: string;
  regionName: string;
  hoursUntil: number;
  affectedWallets: string[];
}): Promise<void> {
  const msg = templates.incursionWarning({
    factionName: params.factionName,
    regionName: params.regionName,
    hoursUntil: params.hoursUntil,
  });
  for (const wallet of params.affectedWallets) {
    const sub = getSubscription(wallet);
    if (sub) {
      sendMessage(sub.chat_id, msg).catch(() => {});
    }
  }
}

// ---- Helpers ----

function getSubscription(wallet: string): { chat_id: string } | null {
  try {
    const db = getDb();
    const stmts = preparedStatements(db);
    return stmts.getTelegramSub.get(wallet) as { chat_id: string } | undefined ?? null;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "expired";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ---- Scheduled reminders ----

const scheduledTimers = new Set<ReturnType<typeof setTimeout>>();

function scheduleReminder(chatId: string, hexName: string, deadline: number, hoursBeforeDeadline: number) {
  const triggerAt = deadline - hoursBeforeDeadline * 3600;
  const delayMs = (triggerAt - Math.floor(Date.now() / 1000)) * 1000;
  if (delayMs <= 0) return; // Already past this point

  const timer = setTimeout(async () => {
    scheduledTimers.delete(timer);
    const remaining = deadline - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return; // Attack already resolved
    await sendMessage(chatId, templates.countdownReminder({
      hexName,
      timeRemaining: formatDuration(remaining),
    }));
  }, delayMs);

  scheduledTimers.add(timer);
}

// ---- Bot command polling ----

async function pollUpdates(): Promise<void> {
  try {
    const res = await fetch(
      `${TG_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=10&allowed_updates=["message"]`,
    );
    if (!res.ok) return;
    const data = await res.json() as any;
    if (!data.ok || !Array.isArray(data.result)) return;

    for (const update of data.result) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      const msg = update.message;
      if (!msg?.text || !msg?.chat?.id) continue;

      const chatId = String(msg.chat.id);
      const text = msg.text.trim();

      if (text.startsWith("/start ")) {
        const wallet = text.slice(7).trim();
        if (wallet.length >= 32 && wallet.length <= 44) {
          const db = getDb();
          const stmts = preparedStatements(db);
          stmts.upsertTelegramSub.run({
            wallet,
            chat_id: chatId,
            enabled: 1,
            created_at: Math.floor(Date.now() / 1000),
          });
          await sendMessage(chatId,
            `Subscribed! You'll receive attack alerts for wallet ${wallet.slice(0, 8)}...\n\nSend /stop to unsubscribe.`
          );
          logger.info(`Telegram subscription added: ${wallet.slice(0, 8)}... → chat ${chatId}`);
        } else {
          await sendMessage(chatId, "Please send /start <your_wallet_address>");
        }
      } else if (text === "/stop") {
        // Disable all subscriptions for this chat
        const db = getDb();
        const stmt = db.prepare("UPDATE telegram_subscriptions SET enabled = 0 WHERE chat_id = ?");
        stmt.run(chatId);
        await sendMessage(chatId, "Notifications disabled. Send /start <wallet> to re-subscribe.");
        logger.info(`Telegram subscription disabled for chat ${chatId}`);
      } else if (text === "/start") {
        await sendMessage(chatId,
          "Welcome to Solvasion alerts!\n\nSend /start <your_wallet_address> to subscribe.\nSend /stop to unsubscribe."
        );
      }
    }
  } catch (err) {
    logger.error("Telegram polling error", { error: String(err) });
  }
}

// ---- Lifecycle ----

export function startTelegram(): boolean {
  if (!config.tgEnabled || !config.tgBotToken) {
    logger.info("Telegram disabled — TG_ENABLED not set or TG_BOT_TOKEN missing");
    return false;
  }

  // Poll for commands every 15s
  const poll = async () => {
    await pollUpdates();
    if (pollingTimer !== null) {
      pollingTimer = setTimeout(poll, 15_000);
    }
  };

  pollingTimer = setTimeout(poll, 1000);
  logger.info("Telegram bot started");
  return true;
}

export function stopTelegram() {
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
  for (const timer of scheduledTimers) {
    clearTimeout(timer);
  }
  scheduledTimers.clear();
  logger.info("Telegram bot stopped");
}
