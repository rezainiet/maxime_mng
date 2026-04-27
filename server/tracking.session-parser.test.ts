import { beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

function buildCreateSessionResponse() {
  return [
    {
      result: {
        data: {
          json: {
            success: true,
            sessionToken: "session_123",
            telegramBotUrl:
              "https://t.me/Maxime1_bot?start=Z3JvdXA6ZGV2UlBrUUUyTnIzV2I1aDZpREtpWllnSXZyTmx4cTU",
            telegramDeepLink:
              "tg://resolve?domain=Maxime1_bot&start=Z3JvdXA6ZGV2UlBrUUUyTnIzV2I1aDZpREtpWllnSXZyTmx4cTU",
            payload: "Z3JvdXA6ZGV2UlBrUUUyTnIzV2I1aDZpREtpWllnSXZyTmx4cTU",
          },
        },
      },
    },
  ];
}

function buildLeadAckResponse() {
  return [{ result: { data: { json: { success: true } } } }];
}

describe("tracking session parser", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("reads telegramBotUrl from result.data.json and preserves the exact start payload link", async () => {
    const sessionStorage = new MemoryStorage();
    const localStorage = new MemoryStorage();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => buildCreateSessionResponse(),
      }),
    );

    vi.stubGlobal("window", {
      sessionStorage,
      localStorage,
      location: {
        href: "https://www.mister-b.club/?fbclid=test_fbclid",
        search: "?fbclid=test_fbclid",
      },
    });

    vi.stubGlobal("document", {
      referrer: "https://facebook.com/",
      cookie: "",
      visibilityState: "visible",
      addEventListener: vi.fn(),
    });

    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "iPhone" },
      configurable: true,
    });

    const tracking = await import("../client/src/lib/tracking");
    const session = await tracking.ensureTrackingSession();

    expect(session?.telegramBotUrl).toBe(
      "https://t.me/Maxime1_bot?start=Z3JvdXA6ZGV2UlBrUUUyTnIzV2I1aDZpREtpWllnSXZyTmx4cTU",
    );
    // The active key is v4 (no longer mirrored to legacy keys; reads still
    // fall back to v3/v2 for in-flight sessions across the deploy boundary).
    expect(sessionStorage.getItem("misterb_tracking_session_v4")).toContain("?start=");
  });

  it("waits for createSession and markTelegramClick before resolving the Telegram group click helper", async () => {
    const sessionStorage = new MemoryStorage();
    const localStorage = new MemoryStorage();
    // trackTelegramGroupClick now fires a Lead pixel + tracking.record BEFORE
    // resolving the session (so Meta gets the high-intent signal even if the
    // user closes the tab during session resolve). The fetch order is:
    //   1) /api/trpc/tracking.record  ← Lead (postTrackingRecord)
    //   2) /api/trpc/tracking.createSession
    //   3) /api/trpc/tracking.markTelegramClick
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => buildLeadAckResponse(),
      })
      .mockResolvedValueOnce({
        json: async () => buildCreateSessionResponse(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: { data: { json: { success: true } } } }],
      });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      sessionStorage,
      localStorage,
      clarity: vi.fn(),
      location: {
        href: "https://mister-b.club/?utm_source=fb&utm_medium=paid&fbclid=test_fbclid",
        search: "?utm_source=fb&utm_medium=paid&fbclid=test_fbclid",
      },
    });

    vi.stubGlobal("document", {
      referrer: "https://facebook.com/",
      cookie: "_fbp=fb.1.1777129000000.1234567890",
      visibilityState: "visible",
      addEventListener: vi.fn(),
    });

    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
      configurable: true,
    });

    const tracking = await import("../client/src/lib/tracking");
    const session = await tracking.trackTelegramGroupClick("telegram_group_cta");

    expect(session?.sessionToken).toBe("session_123");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/trpc/tracking.record?batch=1");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/trpc/tracking.createSession?batch=1");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/trpc/tracking.markTelegramClick?batch=1");

    const leadPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(leadPayload[0].json.eventType).toBe("lead");
    expect(leadPayload[0].json.eventSource).toBe("telegram_group_cta");

    const markClickPayload = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(markClickPayload[0].json.sessionToken).toBe("session_123");
    expect(markClickPayload[0].json.source).toBe("telegram_group_cta");
  });
});
