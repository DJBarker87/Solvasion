import { config } from "../config.js";
import { getDb, preparedStatements } from "../db.js";
import { logger } from "../utils/logger.js";
import * as templates from "./templates.js";

// Telegram Bot API via fetch (no heavy dependency needed)
const TG_API = `https://api.telegram.org/bot${config.tgBotToken}`;

let pollingTimer: ReturnType<typeof setTimeout> | null = null;
let lastUpdateId = 0;

// Skirmish seasons suppress Telegram notifications (too spammy for 20-min games)
let activeSeasonIsSkirmish = false;
export function setSkirmishMode(isSkirmish: boolean): void {
  activeSeasonIsSkirmish = isSkirmish;
}

// Rate limit: track last bind attempt per chat_id (in-memory, resets on restart)
const bindRateLimit = new Map<string, number>();

// Pending verifications: wallet → { code, chatId, expiresAt }
const pendingVerifications = new Map<string, { code: string; chatId: number; expiresAt: number }>();

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Verify a pending Telegram binding. Called by the API route after wallet
 * signature verification. Returns true if the code matches and the binding
 * is activated; false otherwise.
 */
export function verifyTelegramBinding(wallet: string, code: string, chatId: number): boolean {
  const pending = pendingVerifications.get(wallet);
  if (!pending) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now > pending.expiresAt) {
    pendingVerifications.delete(wallet);
    return false;
  }

  if (pending.code !== code.toUpperCase() || pending.chatId !== chatId) {
    return false;
  }

  // Verification passed — activate the subscription in the DB
  pendingVerifications.delete(wallet);

  const db = getDb();
  const stmts = preparedStatements(db);
  stmts.upsertTelegramSub.run({
    wallet,
    chat_id: String(chatId),
    enabled: 1,
    created_at: now,
  });

  // Notify the user via Telegram
  sendMessage(String(chatId),
    `Wallet ${wallet.slice(0, 8)}... verified and linked.\n\nYou will now receive attack alerts and notifications.\nSend /stop to unsubscribe.`
  ).catch(() => {});

  logger.info(`Telegram subscription verified: ${wallet.slice(0, 8)}... → chat ${chatId}`);
  return true;
}

/**
 * Look up the pending verification chatId for a wallet (used by the API route).
 */
export function getPendingVerification(wallet: string): { code: string; chatId: number; expiresAt: number } | null {
  const pending = pendingVerifications.get(wallet);
  if (!pending) return null;
  const now = Math.floor(Date.now() / 1000);
  if (now > pending.expiresAt) {
    pendingVerifications.delete(wallet);
    return null;
  }
  return pending;
}

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
  if (activeSeasonIsSkirmish) return; // No notifications during skirmishes
  const sub = getSubscription(params.defenderWallet);
  if (!sub) return;

  const deadlineDate = new Date(params.deadline * 1000);
  const deadlineUtc = deadlineDate.toISOString().slice(11, 16) + " UTC";
  const remaining = params.deadline - Math.floor(Date.now() / 1000);
  const timeRemaining = formatDuration(remaining);

  await sendMessage(sub.chat_id, templates.attackAlert({
    hexName: params.hexName,
    attackerWallet: params.attackerWallet,
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
  if (activeSeasonIsSkirmish) return;
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
  if (activeSeasonIsSkirmish) return;
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
  if (activeSeasonIsSkirmish) return;
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
          // Rate limit: max 1 bind attempt per chat_id per hour
          const now = Math.floor(Date.now() / 1000);
          const lastAttempt = bindRateLimit.get(chatId);
          if (lastAttempt && now - lastAttempt < 3600) {
            await sendMessage(chatId,
              "You can only bind a wallet once per hour. Please wait before trying again."
            );
            continue;
          }
          bindRateLimit.set(chatId, now);

          // Generate verification code and store as pending (10-minute expiry)
          const code = generateVerificationCode();
          pendingVerifications.set(wallet, {
            code,
            chatId: Number(chatId),
            expiresAt: now + 600, // 10 minutes
          });

          await sendMessage(chatId,
            `Verification code: <b>${code}</b>\n\n` +
            `Please verify in the game UI to link wallet ${wallet.slice(0, 8)}...\n` +
            `This code expires in 10 minutes.`
          );
          logger.info(`Telegram verification pending: ${wallet.slice(0, 8)}... → chat ${chatId}, code ${code}`);
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
