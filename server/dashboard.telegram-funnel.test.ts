import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");
const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

describe("Dashboard Telegram funnel", () => {
  it("splits Telegram bot clicks from direct contact clicks in the aggregation queries", () => {
    expect(dbSource).toContain("COALESCE(eventSource, '') LIKE 'telegram_group%'");
    expect(dbSource).toContain("COALESCE(eventSource, '') NOT LIKE 'telegram_group%'");
  });

  it("renders the clearer Telegram funnel cards and consumes the bot-start overview query", () => {
    expect(dashboardSource).toContain('title="Clic bot Telegram"');
    expect(dashboardSource).toContain('title="Start bot"');
    // "Starts → joined" replaced "Membres rejoints" so the reader can no
    // longer confuse this KPI (bot_starts.joinedAt) with the telegram_joins
    // total count.
    expect(dashboardSource).toContain('title="Starts → joined"');
    expect(dashboardSource).toContain('title="Contact direct"');
    expect(dashboardSource).toContain("trpc.dashboard.telegramOverview.useQuery");
    expect(dashboardSource).toContain("botToMemberRate");
  });

  it("surfaces the join-table breakdown that the server already returns", () => {
    // Pre-fix the dashboard dropped joinsByCampaign / attributedJoins / etc.
    // even though the server returned them. The new cards make those visible.
    expect(dashboardSource).toContain('title="Total joins"');
    expect(dashboardSource).toContain('title="Funnel joins"');
    expect(dashboardSource).toContain('title="Attribués"');
    expect(dashboardSource).toContain('title="Bypass joins"');
  });

  it("renders rolling-window join cards (1h / 6h / 24h / today)", () => {
    expect(dashboardSource).toContain('title="Joins · 1h"');
    expect(dashboardSource).toContain('title="Joins · 6h"');
    expect(dashboardSource).toContain('title="Joins · 24h"');
    expect(dashboardSource).toContain('title="Joins · today"');
  });

  it("surfaces approve/decline counters from the join_request audit", () => {
    expect(dashboardSource).toContain('title="Approuvés today"');
    expect(dashboardSource).toContain('title="Refusés today"');
    expect(dashboardSource).toContain('title="Bypass attempts today"');
  });
});
