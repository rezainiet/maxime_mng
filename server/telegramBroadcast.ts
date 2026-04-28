import { tryAcquireLease } from "./_core/leaderLease";
import { log } from "./_core/logger";
import {
  bumpBroadcastJobCounters,
  finalizeBroadcastJobIfDone,
  getNextPendingBroadcastDeliveries,
  getNextProcessableBroadcastJob,
  markBroadcastDelivery,
  markBroadcastJobProcessing,
} from "./db";
import { buildJoinGroupKeyboard, sendTelegramMessage } from "./telegramBot";
import { getTelegramGroupUrl } from "./telegramGroupLink";

const WORKER_NAME = "telegram_broadcast";

// Telegram allows ~30 outbound messages/sec across different chats. We process
// in small batches with a fixed tick interval so two batches never overlap and
// the effective rate stays comfortably below the limit. 25 per 1500ms tick =
// ~16.7 msg/sec, with headroom for retries.
const WORKER_INTERVAL_MS = 1500;
const BATCH_PER_TICK = 25;
// Inter-message delay inside a batch — tiny pauses keep the bursts smoother
// from Telegram's rate-limiter's perspective.
const INTRA_BATCH_DELAY_MS = 50;

let workerStarted = false;
let workerInterval: NodeJS.Timeout | null = null;
let workerRunning = false;

export function renderBroadcastMessage(template: string, firstName: string | null) {
  const safeFirstName = (firstName || "").trim() || "toi";
  return template
    .replaceAll("{first_name}", safeFirstName)
    .replaceAll("{firstName}", safeFirstName)
    .replaceAll("{brand}", "MAXIME");
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function processBroadcastTick() {
  const job = await getNextProcessableBroadcastJob();
  if (!job) return { processed: 0 };

  if (job.status === "pending") {
    await markBroadcastJobProcessing(job.id);
  }

  const deliveries = await getNextPendingBroadcastDeliveries(job.id, BATCH_PER_TICK);
  if (deliveries.length === 0) {
    await finalizeBroadcastJobIfDone(job.id);
    return { processed: 0, jobId: job.id };
  }

  // Attach the same join-group button to every broadcast message so users see
  // the same CTA regardless of which message type the bot just sent. Resolved
  // once per tick (one DB read per batch instead of per delivery).
  const groupUrl = await getTelegramGroupUrl();
  const replyMarkup = buildJoinGroupKeyboard(groupUrl);

  let sent = 0;
  let blocked = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const messageText = renderBroadcastMessage(job.messageText, delivery.firstName);
    const result = await sendTelegramMessage(delivery.chatId, messageText, { replyMarkup });

    if (result.ok) {
      await markBroadcastDelivery({ id: delivery.id, status: "sent" });
      sent += 1;
    } else if (result.blocked) {
      await markBroadcastDelivery({
        id: delivery.id,
        status: "blocked",
        errorDescription: result.description ?? "blocked",
      });
      blocked += 1;
    } else {
      await markBroadcastDelivery({
        id: delivery.id,
        status: "failed",
        errorDescription: result.description ?? `http_${result.status}`,
      });
      failed += 1;
    }

    if (INTRA_BATCH_DELAY_MS > 0) {
      await sleep(INTRA_BATCH_DELAY_MS);
    }
  }

  if (sent || blocked || failed) {
    await bumpBroadcastJobCounters({ jobId: job.id, sent, blocked, failed });
  }

  await finalizeBroadcastJobIfDone(job.id);

  return { processed: deliveries.length, jobId: job.id, sent, blocked, failed };
}

export function startTelegramBroadcastWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const run = async () => {
    if (workerRunning) return;
    workerRunning = true;

    try {
      const isLeader = await tryAcquireLease(WORKER_NAME);
      if (!isLeader) {
        log.info("telegramBroadcast", "skip_tick_not_leader");
        return;
      }
      await processBroadcastTick();
    } catch (error) {
      log.error("telegramBroadcast", "worker_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      workerRunning = false;
    }
  };

  void run();
  workerInterval = setInterval(() => {
    void run();
  }, WORKER_INTERVAL_MS);
}

export function stopTelegramBroadcastWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  workerStarted = false;
  workerRunning = false;
}
