import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendTelegramMessageMock, dbMocks } = vi.hoisted(() => ({
  sendTelegramMessageMock: vi.fn(),
  dbMocks: {
    getNextProcessableBroadcastJob: vi.fn(),
    markBroadcastJobProcessing: vi.fn(),
    getNextPendingBroadcastDeliveries: vi.fn(),
    markBroadcastDelivery: vi.fn(),
    bumpBroadcastJobCounters: vi.fn(),
    finalizeBroadcastJobIfDone: vi.fn(),
  },
}));

vi.mock("./telegramBot", () => ({
  sendTelegramMessage: sendTelegramMessageMock,
}));

vi.mock("./_core/leaderLease", () => ({
  tryAcquireLease: vi.fn().mockResolvedValue(true),
}));

vi.mock("./db", () => dbMocks);

import { processBroadcastTick, renderBroadcastMessage } from "./telegramBroadcast";

describe("renderBroadcastMessage", () => {
  it("substitutes {firstName} and {first_name}", () => {
    expect(renderBroadcastMessage("Hi {firstName}!", "Sami")).toBe("Hi Sami!");
    expect(renderBroadcastMessage("Hi {first_name}", "Sami")).toBe("Hi Sami");
  });

  it("falls back to 'toi' when no first name is provided", () => {
    expect(renderBroadcastMessage("Hi {firstName}", null)).toBe("Hi toi");
    expect(renderBroadcastMessage("Hi {firstName}", "  ")).toBe("Hi toi");
  });

  it("substitutes {brand}", () => {
    expect(renderBroadcastMessage("Welcome to {brand}", "Sami")).toBe("Welcome to MAXIME");
  });
});

describe("processBroadcastTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns processed:0 when no job is available", async () => {
    dbMocks.getNextProcessableBroadcastJob.mockResolvedValue(null);
    const result = await processBroadcastTick();
    expect(result).toEqual({ processed: 0 });
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("marks pending job as processing then sends + counts deliveries", async () => {
    dbMocks.getNextProcessableBroadcastJob.mockResolvedValue({
      id: 42,
      status: "pending",
      messageText: "Hello {firstName}",
    });
    dbMocks.getNextPendingBroadcastDeliveries.mockResolvedValue([
      { id: 1, broadcastJobId: 42, telegramUserId: "u1", chatId: "u1", firstName: "Anna" },
      { id: 2, broadcastJobId: 42, telegramUserId: "u2", chatId: "u2", firstName: "Bob" },
      { id: 3, broadcastJobId: 42, telegramUserId: "u3", chatId: "u3", firstName: null },
    ]);
    sendTelegramMessageMock
      .mockResolvedValueOnce({ ok: true, blocked: false, status: 200 })
      .mockResolvedValueOnce({ ok: false, blocked: true, status: 403, description: "Forbidden: bot was blocked by the user" })
      .mockResolvedValueOnce({ ok: false, blocked: false, status: 500, description: "internal" });
    dbMocks.finalizeBroadcastJobIfDone.mockResolvedValue(false);

    const result = await processBroadcastTick();

    expect(dbMocks.markBroadcastJobProcessing).toHaveBeenCalledWith(42);
    expect(sendTelegramMessageMock).toHaveBeenCalledTimes(3);
    expect(sendTelegramMessageMock).toHaveBeenNthCalledWith(1, "u1", "Hello Anna");
    expect(sendTelegramMessageMock).toHaveBeenNthCalledWith(2, "u2", "Hello Bob");
    expect(sendTelegramMessageMock).toHaveBeenNthCalledWith(3, "u3", "Hello toi");

    expect(dbMocks.markBroadcastDelivery).toHaveBeenCalledWith({ id: 1, status: "sent" });
    expect(dbMocks.markBroadcastDelivery).toHaveBeenCalledWith({
      id: 2,
      status: "blocked",
      errorDescription: "Forbidden: bot was blocked by the user",
    });
    expect(dbMocks.markBroadcastDelivery).toHaveBeenCalledWith({
      id: 3,
      status: "failed",
      errorDescription: "internal",
    });

    expect(dbMocks.bumpBroadcastJobCounters).toHaveBeenCalledWith({
      jobId: 42,
      sent: 1,
      blocked: 1,
      failed: 1,
    });
    expect(dbMocks.finalizeBroadcastJobIfDone).toHaveBeenCalledWith(42);
    expect(result).toEqual({ processed: 3, jobId: 42, sent: 1, blocked: 1, failed: 1 });
  }, 10_000);

  it("does not re-mark a job already in 'processing'", async () => {
    dbMocks.getNextProcessableBroadcastJob.mockResolvedValue({
      id: 7,
      status: "processing",
      messageText: "Hi",
    });
    dbMocks.getNextPendingBroadcastDeliveries.mockResolvedValue([]);
    dbMocks.finalizeBroadcastJobIfDone.mockResolvedValue(true);

    await processBroadcastTick();

    expect(dbMocks.markBroadcastJobProcessing).not.toHaveBeenCalled();
    expect(dbMocks.finalizeBroadcastJobIfDone).toHaveBeenCalledWith(7);
  });
});
