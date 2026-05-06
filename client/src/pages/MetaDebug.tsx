import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  Clock3,
  Copy,
  Loader2,
  LockKeyhole,
  Radio,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  TabletSmartphone,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const TOKEN_KEY = "misterb-dash-token";
// Try the live key (v4) first, then fall back to legacy keys mirrored by
// tracking.ts so we can debug both fresh and stale browser sessions.
const TRACKING_STORAGE_KEYS = [
  "misterb_tracking_session_v4",
  "misterb_tracking_session_v3",
  "misterb_tracking_session_v2",
];

const LIMIT = 10;

type PageViewLogRow = {
  id: number;
  eventType: string;
  eventSource: string | null;
  visitorId: string | null;
  referrer: string | null;
  country: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string | Date;
};

type SessionLogRow = {
  id: number;
  sessionToken: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  fbclid: string | null;
  fbp: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  referrer: string | null;
  landingPage: string | null;
  clickedTelegramLink: "yes" | "no";
  clickedAt: string | Date | null;
  createdAt: string | Date;
};

type MetaEventState = "pending" | "queued" | "sent" | "failed" | "retrying" | "abandoned";

type JoinLogRow = {
  id: number;
  telegramUserId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  channelTitle: string | null;
  metaEventSent: MetaEventState;
  metaEventId: string | null;
  metaEventSentAt: string | Date | null;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  sessionToken: string | null;
  fbclid: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  joinedAt: string | Date;
  createdAt: string | Date;
};

type SubscribeLogRow = {
  id: number;
  telegramUserId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  metaSubscribeStatus: MetaEventState;
  metaSubscribeEventId: string | null;
  metaSubscribeSentAt: string | Date | null;
  startedAt: string | Date;
  joinedAt: string | Date | null;
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
  sessionToken: string | null;
  fbclid: string | null;
  fbp: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionCreatedAt: string | Date | null;
};

type MetaDebugLogData = {
  pageviews: PageViewLogRow[];
  sessions: SessionLogRow[];
  joins: JoinLogRow[];
  subscribes: SubscribeLogRow[];
};

type BrowserSnapshot = {
  currentUrl: string | null;
  referrer: string | null;
  fbp: string | null;
  fbclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  pageViewEventId: string | null;
  sessionToken: string | null;
  payload: string | null;
  telegramBotUrl: string | null;
  telegramDeepLink: string | null;
};

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[24px] border border-slate-800 bg-slate-900/95 p-5 ${className}`}>{children}</section>;
}

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2] || "") : null;
}

function formatDateTime(value: string | Date | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortValue(value: string | null | undefined, fallback = "—", max = 52) {
  if (!value) return fallback;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function longValue(value: string | null | undefined, fallback = "—") {
  return value && value.trim() ? value : fallback;
}

function metaStatusTone(status: MetaEventState) {
  switch (status) {
    case "sent":
      return {
        border: "border-emerald-500/30",
        background: "bg-emerald-500/10",
        text: "text-emerald-300",
        dot: "bg-emerald-400",
        label: "Sent",
      } as const;
    case "failed":
      return {
        border: "border-red-500/30",
        background: "bg-red-500/10",
        text: "text-red-300",
        dot: "bg-red-400",
        label: "Failed",
      } as const;
    case "abandoned":
      return {
        border: "border-red-700/40",
        background: "bg-red-900/20",
        text: "text-red-200",
        dot: "bg-red-500",
        label: "Abandoned",
      } as const;
    case "retrying":
      return {
        border: "border-amber-500/40",
        background: "bg-amber-500/10",
        text: "text-amber-200",
        dot: "bg-amber-400",
        label: "Retrying",
      } as const;
    case "queued":
      return {
        border: "border-cyan-500/40",
        background: "bg-cyan-500/10",
        text: "text-cyan-200",
        dot: "bg-cyan-400",
        label: "Queued",
      } as const;
    default:
      return {
        border: "border-amber-400/30",
        background: "bg-amber-400/10",
        text: "text-amber-200",
        dot: "bg-amber-300",
        label: "Pending",
      } as const;
  }
}

function subscribeTone(status: SubscribeLogRow["metaSubscribeStatus"]) {
  return metaStatusTone(status);
}

function joinTone(status: JoinLogRow["metaEventSent"]) {
  return metaStatusTone(status);
}

function personLabel(row: { telegramUsername: string | null; telegramFirstName: string | null; telegramUserId: string }) {
  if (row.telegramUsername) return `@${row.telegramUsername}`;
  if (row.telegramFirstName) return row.telegramFirstName;
  return `User ${row.telegramUserId}`;
}

function readBrowserSnapshot(): BrowserSnapshot {
  if (typeof window === "undefined") {
    return {
      currentUrl: null,
      referrer: null,
      fbp: null,
      fbclid: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
      utmTerm: null,
      pageViewEventId: null,
      sessionToken: null,
      payload: null,
      telegramBotUrl: null,
      telegramDeepLink: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const storedPageViewEventId = window.sessionStorage.getItem("misterb_pv_event_id");

  let storedSession: {
    sessionToken?: string;
    payload?: string;
    telegramBotUrl?: string;
    telegramDeepLink?: string;
  } | null = null;

  for (const key of TRACKING_STORAGE_KEYS) {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) continue;
    try {
      storedSession = JSON.parse(raw);
      break;
    } catch {
      // try the next legacy key
    }
  }

  return {
    currentUrl: window.location.href,
    referrer: document.referrer || null,
    fbp: getCookieValue("_fbp"),
    fbclid: params.get("fbclid"),
    utmSource: params.get("utm_source"),
    utmMedium: params.get("utm_medium"),
    utmCampaign: params.get("utm_campaign"),
    utmContent: params.get("utm_content"),
    utmTerm: params.get("utm_term"),
    pageViewEventId: storedPageViewEventId,
    sessionToken: storedSession?.sessionToken || null,
    payload: storedSession?.payload || null,
    telegramBotUrl: storedSession?.telegramBotUrl || null,
    telegramDeepLink: storedSession?.telegramDeepLink || null,
  };
}

function KeyValueRow({
  label,
  value,
  allowCopy = false,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  allowCopy?: boolean;
  multiline?: boolean;
}) {
  const displayValue = multiline ? longValue(value) : shortValue(value);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        {allowCopy && value ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value);
                toast.success(`${label} copied`);
              } catch {
                toast.error(`Unable to copy ${label.toLowerCase()}`);
              }
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-500"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <p className={`mt-2 text-sm text-slate-200 ${multiline ? "break-all" : "break-words"}`}>{displayValue}</p>
    </div>
  );
}

export default function MetaDebug() {
  const [token, setToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(TOKEN_KEY) || "";
  });
  const [browserSnapshot, setBrowserSnapshot] = useState<BrowserSnapshot>(() => readBrowserSnapshot());

  const refreshBrowserSnapshot = useCallback(() => {
    setBrowserSnapshot(readBrowserSnapshot());
  }, []);

  const metaDebugQuery = trpc.dashboard.metaDebugLog.useQuery(
    {
      token,
      limit: LIMIT,
    },
    {
      enabled: Boolean(token),
      retry: false,
      refetchInterval: 5_000,
      refetchOnWindowFocus: true,
    },
  );

  const [metaStatusFilter, setMetaStatusFilter] = useState<
    "all" | "queued" | "sent" | "failed" | "retrying" | "abandoned"
  >("all");
  const [metaEventTypeFilter, setMetaEventTypeFilter] = useState<
    "all" | "PageView" | "Lead" | "Subscribe"
  >("all");

  const metaEventsQuery = trpc.dashboard.metaEvents.useQuery(
    {
      token,
      status: metaStatusFilter,
      eventType: metaEventTypeFilter,
      limit: 50,
    },
    {
      enabled: Boolean(token),
      retry: false,
      refetchInterval: 10_000,
      refetchOnWindowFocus: true,
    },
  );
  const retryMetaEventMutation = trpc.dashboard.retryMetaEvent.useMutation();

  const rawData = metaDebugQuery.data as MetaDebugLogData | { error: string } | undefined;
  const rawMetaEvents = metaEventsQuery.data as
    | {
        rows: Array<{
          id: number;
          eventId: string;
          eventType: string;
          eventScope: string;
          status: MetaEventState;
          httpStatus: number | null;
          errorCode: string | null;
          errorMessage: string | null;
          attemptCount: number;
          retryable: number;
          telegramUserId: string | null;
          createdAt: string | Date;
          updatedAt: string | Date;
          completedAt: string | Date | null;
          nextRetryAt: string | Date | null;
        }>;
        breakdown: Array<{
          errorCode: string;
          httpStatus: number;
          sampleMessage: string;
          occurrences: number;
          lastSeenAt: string | Date | null;
        }>;
        summary: {
          totalStarts: number;
          totalSent: number;
          totalFailed: number;
          totalPending: number;
          todayStarts: number;
          todaySent: number;
          todayFailed: number;
          todayPending: number;
        };
      }
    | { error: string }
    | undefined;
  const metaEvents =
    rawMetaEvents && !("error" in rawMetaEvents) ? rawMetaEvents : null;

  const handleRetryEvent = async (eventId: string) => {
    try {
      const result = await retryMetaEventMutation.mutateAsync({ token, eventId });
      if ("error" in result) {
        toast.error("Retry failed", { description: result.error });
        return;
      }
      if (!result.success && "error" in result) {
        toast.error("Retry failed", { description: (result as { error?: string }).error });
        return;
      }
      const status = (result as { status?: string }).status;
      if (status === "sent") {
        toast.success(`Retried ${eventId.slice(0, 24)}…`, { description: "Meta accepted the event." });
      } else {
        toast.warning(`Status: ${status || "unknown"}`, {
          description: (result as { errorMessage?: string }).errorMessage || "See dashboard for details.",
        });
      }
      void metaEventsQuery.refetch();
    } catch (error) {
      toast.error("Retry threw", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  useEffect(() => {
    refreshBrowserSnapshot();
  }, [refreshBrowserSnapshot]);

  useEffect(() => {
    if (!rawData || !("error" in rawData) || rawData.error !== "Unauthorized") {
      return;
    }

    setToken("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
    }
    toast.error("Session dashboard expirée", {
      description: "Reconnecte-toi au dashboard privé pour rouvrir la page de debug live.",
    });
  }, [rawData]);

  const data = useMemo(() => {
    return rawData && !("error" in rawData) ? rawData : null;
  }, [rawData]);

  if (!token) {
    return (
      <main className="min-h-screen bg-[#0b1120] px-4 py-8 text-white sm:px-6">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
          <Card className="w-full border-slate-800 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.10),transparent_32%),#111827] p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Debug privé
            </div>
            <h1 className="mt-5 text-[1.9rem] font-bold tracking-[-0.06em] text-amber-300">Live Tracking Debug</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Open the private dashboard first so this page can reuse the admin token and show the live tracking pipeline.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              <LockKeyhole className="h-4 w-4" /> Open private dashboard
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0b1120] text-white">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
        <header className="rounded-[24px] border border-slate-800 bg-slate-900/95 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                <Radio className="h-4 w-4" /> Live diagnostics
              </div>
              <h1 className="mt-4 text-[2rem] font-bold tracking-[-0.06em] text-amber-300">Live Tracking Debug</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                This screen combines the current browser state with the latest server-side sessions, PageViews, Telegram joins, and Meta Subscribe outcomes so you can isolate tracking issues quickly.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={refreshBrowserSnapshot}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm font-medium text-slate-200 transition hover:border-slate-500"
              >
                <TabletSmartphone className="h-4 w-4" /> Refresh browser snapshot
              </button>
              <button
                type="button"
                onClick={() => void metaDebugQuery.refetch()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-cyan-500/35 bg-slate-950 px-4 text-sm font-medium text-cyan-200 transition hover:border-cyan-400"
              >
                <RefreshCcw className={`h-4 w-4 ${metaDebugQuery.isFetching ? "animate-spin" : ""}`} /> Refresh live feed
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500"
            >
              <ArrowLeft className="h-4 w-4" /> Retour au dashboard
            </Link>
            <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-emerald-400" /> Auto-refresh every 5 seconds
              </span>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-400" /> {LIMIT} latest rows per live section
              </span>
            </div>
          </div>
        </header>

        {/* === P4: Meta event explorer (filters + retry-one + error breakdown) === */}
        <Card className="mt-4 border-amber-500/30 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.10),transparent_38%),#111827]">
          <div className="flex items-center gap-2 text-amber-300">
            <Activity className="h-4 w-4" />
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Meta event explorer</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Filter <code className="rounded bg-slate-900 px-1 text-xs">meta_event_logs</code> by status / type, retry a single event in one click, and see the top error causes from the last 24 h.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/75 px-3 py-2">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Sent today</p>
              <p className="mt-1 text-xl font-bold text-emerald-300">{(metaEvents?.summary.todaySent ?? 0).toLocaleString("fr-FR")}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/75 px-3 py-2">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Failed today</p>
              <p className="mt-1 text-xl font-bold text-red-300">{(metaEvents?.summary.todayFailed ?? 0).toLocaleString("fr-FR")}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/75 px-3 py-2">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Pending / retrying</p>
              <p className="mt-1 text-xl font-bold text-amber-200">{(metaEvents?.summary.totalPending ?? 0).toLocaleString("fr-FR")}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/75 px-3 py-2">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">Total starts logged</p>
              <p className="mt-1 text-xl font-bold text-slate-200">{(metaEvents?.summary.totalStarts ?? 0).toLocaleString("fr-FR")}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span>Status</span>
              <select
                value={metaStatusFilter}
                onChange={(e) =>
                  setMetaStatusFilter(e.target.value as typeof metaStatusFilter)
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              >
                <option value="all">All</option>
                <option value="sent">sent</option>
                <option value="failed">failed</option>
                <option value="retrying">retrying</option>
                <option value="abandoned">abandoned</option>
                <option value="queued">queued</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-400">
              <span>Type</span>
              <select
                value={metaEventTypeFilter}
                onChange={(e) =>
                  setMetaEventTypeFilter(e.target.value as typeof metaEventTypeFilter)
                }
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              >
                <option value="all">All</option>
                <option value="PageView">PageView</option>
                <option value="Lead">Lead</option>
                <option value="Subscribe">Subscribe</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void metaEventsQuery.refetch()}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300 hover:border-slate-500"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${metaEventsQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {metaEventsQuery.isLoading ? (
                <p className="text-sm text-slate-400">Loading…</p>
              ) : !metaEvents || metaEvents.rows.length === 0 ? (
                <p className="text-sm text-slate-400">No matching meta events.</p>
              ) : (
                metaEvents.rows.map((row) => {
                  const tone = metaStatusTone(row.status);
                  return (
                    <div
                      key={row.id}
                      className="rounded-[14px] border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[11px] text-slate-200">
                            {row.eventType} · {row.eventScope} · #{row.id}
                          </p>
                          <p className="truncate text-[10px] text-slate-500">{row.eventId}</p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.border} ${tone.background} ${tone.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} /> {tone.label}
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
                        <p>
                          <span className="text-slate-500">HTTP:</span>{" "}
                          {row.httpStatus ?? "—"}
                        </p>
                        <p>
                          <span className="text-slate-500">Attempts:</span>{" "}
                          {row.attemptCount}
                        </p>
                        <p>
                          <span className="text-slate-500">Updated:</span>{" "}
                          {formatDateTime(row.updatedAt)}
                        </p>
                        <p>
                          <span className="text-slate-500">Next retry:</span>{" "}
                          {formatDateTime(row.nextRetryAt)}
                        </p>
                      </div>
                      {row.errorMessage ? (
                        <p className="mt-1 text-[11px] text-red-300">
                          {row.errorCode ? `[${row.errorCode}] ` : ""}
                          {row.errorMessage.slice(0, 240)}
                        </p>
                      ) : null}
                      {(row.status === "failed" ||
                        row.status === "retrying" ||
                        row.status === "abandoned") && row.retryable ? (
                        <button
                          type="button"
                          onClick={() => void handleRetryEvent(row.eventId)}
                          disabled={retryMetaEventMutation.isPending}
                          className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] font-medium text-amber-200 hover:border-amber-300 disabled:opacity-60"
                        >
                          <RefreshCcw className="h-3 w-3" /> Retry now
                        </button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Top errors · last 24 h
              </h3>
              <div className="mt-2 space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {!metaEvents || metaEvents.breakdown.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No errors in the last 24 h. 🎉
                  </p>
                ) : (
                  metaEvents.breakdown.map((row, i) => (
                    <div
                      key={`${row.errorCode}-${row.httpStatus}-${i}`}
                      className="rounded-[12px] border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-200">
                          [{row.errorCode || "no_code"}] HTTP {row.httpStatus || "—"}
                        </span>
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] text-amber-200">
                          ×{row.occurrences}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400 line-clamp-3">
                        {row.sampleMessage}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-600">
                        last seen {formatDateTime(row.lastSeenAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_1fr]">
          <Card className="border-emerald-500/30 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.13),transparent_38%),#111827]">
            <div className="flex items-center gap-2 text-emerald-300">
              <Smartphone className="h-4 w-4" />
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Current Browser Snapshot</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              These values are read live from this browser session, without relying on the database.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <KeyValueRow label="_fbp" value={browserSnapshot.fbp} allowCopy />
              <KeyValueRow label="fbclid" value={browserSnapshot.fbclid} allowCopy />
              <KeyValueRow label="UTM source" value={browserSnapshot.utmSource} />
              <KeyValueRow label="UTM medium" value={browserSnapshot.utmMedium} />
              <KeyValueRow label="UTM campaign" value={browserSnapshot.utmCampaign} />
              <KeyValueRow label="UTM content" value={browserSnapshot.utmContent} />
              <KeyValueRow label="UTM term" value={browserSnapshot.utmTerm} />
              <KeyValueRow label="PageView event ID" value={browserSnapshot.pageViewEventId} allowCopy />
              <KeyValueRow label="Session token" value={browserSnapshot.sessionToken} allowCopy />
              <KeyValueRow label="Telegram payload" value={browserSnapshot.payload} allowCopy />
              <KeyValueRow label="Referrer" value={browserSnapshot.referrer} multiline />
              <KeyValueRow label="Current URL" value={browserSnapshot.currentUrl} multiline allowCopy />
              <KeyValueRow label="Telegram bot URL" value={browserSnapshot.telegramBotUrl} multiline allowCopy />
              <KeyValueRow label="Telegram deep link" value={browserSnapshot.telegramDeepLink} multiline allowCopy />
            </div>
          </Card>

          <Card className="border-cyan-500/35 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_40%),#111827]">
            <div className="flex items-center gap-2 text-cyan-300">
              <Radio className="h-4 w-4" />
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Latest Landing Sessions</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              These rows confirm what the landing actually persisted when visitors arrived from ads.
            </p>
            <div className="mt-4 space-y-3">
              {(data?.sessions || []).length === 0 ? (
                <div className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4 text-sm text-slate-400">
                  No landing session recorded yet.
                </div>
              ) : (
                data?.sessions.map((row) => (
                  <div key={row.id} className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">Session #{row.id}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {row.utmSource} · {row.utmMedium} · {row.utmCampaign}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400">{formatDateTime(row.createdAt)}</p>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                      <p><span className="text-slate-500">Session:</span> {shortValue(row.sessionToken)}</p>
                      <p><span className="text-slate-500">Clicked Telegram:</span> {row.clickedTelegramLink === "yes" ? "Yes" : "No"}</p>
                      <p><span className="text-slate-500">Clicked at:</span> {formatDateTime(row.clickedAt)}</p>
                      <p><span className="text-slate-500">FBCLID:</span> {shortValue(row.fbclid)}</p>
                      <p><span className="text-slate-500">FBP:</span> {shortValue(row.fbp)}</p>
                      <p><span className="text-slate-500">UTM content:</span> {shortValue(row.utmContent)}</p>
                      <p><span className="text-slate-500">UTM term:</span> {shortValue(row.utmTerm)}</p>
                      <p><span className="text-slate-500">IP:</span> {shortValue(row.ipAddress)}</p>
                      <p className="md:col-span-2 break-all"><span className="text-slate-500">Landing:</span> {longValue(row.landingPage)}</p>
                      <p className="md:col-span-2 break-all"><span className="text-slate-500">Referrer:</span> {longValue(row.referrer)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {metaDebugQuery.isLoading ? (
          <div className="mt-4 flex min-h-[35vh] items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-700 bg-slate-900 px-5 py-3 text-sm text-slate-200">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading live tracking diagnostics...
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <Card className="border-sky-500/35 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_40%),#111827] xl:col-span-1">
              <div className="flex items-center gap-2 text-sky-300">
                <Activity className="h-4 w-4" />
                <h2 className="text-lg font-semibold tracking-[-0.03em]">Latest PageView Calls</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                These are the latest server PageView records received by the landing backend.
              </p>
              <div className="mt-4 space-y-3">
                {(data?.pageviews || []).length === 0 ? (
                  <div className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4 text-sm text-slate-400">
                    No PageView row recorded yet.
                  </div>
                ) : (
                  data?.pageviews.map((row) => (
                    <div key={row.id} className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4 text-sm text-slate-300">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-white">PageView #{row.id}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">{row.eventSource || "landing"}</p>
                        </div>
                        <p className="text-xs text-slate-400">{formatDateTime(row.createdAt)}</p>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <p><span className="text-slate-500">Visitor:</span> {shortValue(row.visitorId)}</p>
                        <p><span className="text-slate-500">Country:</span> {shortValue(row.country)}</p>
                        <p><span className="text-slate-500">IP:</span> {shortValue(row.ip)}</p>
                        <p className="break-all"><span className="text-slate-500">Referrer:</span> {longValue(row.referrer, "Direct")}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="border-fuchsia-500/35 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.14),transparent_40%),#111827] xl:col-span-1">
              <div className="flex items-center gap-2 text-fuchsia-300">
                <ShieldCheck className="h-4 w-4" />
                <h2 className="text-lg font-semibold tracking-[-0.03em]">Latest Telegram Joins</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                These rows show whether the join event itself was linked to the stored landing session and whether the Meta join event was marked sent or failed.
              </p>
              <div className="mt-4 space-y-3">
                {(data?.joins || []).length === 0 ? (
                  <div className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4 text-sm text-slate-400">
                    No Telegram join recorded yet.
                  </div>
                ) : (
                  data?.joins.map((row) => {
                    const tone = joinTone(row.metaEventSent);
                    return (
                      <div key={row.id} className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4 text-sm text-slate-300">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{personLabel(row)}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                              {row.utmSource} · {row.utmMedium} · {row.utmCampaign}
                            </p>
                          </div>
                          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${tone.border} ${tone.background} ${tone.text}`}>
                            <span className={`h-2 w-2 rounded-full ${tone.dot}`} /> {tone.label}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <p><span className="text-slate-500">Joined:</span> {formatDateTime(row.joinedAt)}</p>
                          <p><span className="text-slate-500">Meta event ID:</span> {shortValue(row.metaEventId)}</p>
                          <p><span className="text-slate-500">Session:</span> {shortValue(row.sessionToken)}</p>
                          <p><span className="text-slate-500">FBCLID:</span> {shortValue(row.fbclid)}</p>
                          <p><span className="text-slate-500">Sent at:</span> {formatDateTime(row.metaEventSentAt)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card className="border-violet-500/35 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.14),transparent_40%),#111827] xl:col-span-1">
              <div className="flex items-center gap-2 text-violet-300">
                <Radio className="h-4 w-4" />
                <h2 className="text-lg font-semibold tracking-[-0.03em]">Latest Meta Subscribe Outcomes</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                These rows show whether the bot start and stored landing session were reused successfully when Subscribe was sent to Meta.
              </p>
              <div className="mt-4 space-y-3">
                {(data?.subscribes || []).length === 0 ? (
                  <div className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4 text-sm text-slate-400">
                    No Subscribe outcome recorded yet.
                  </div>
                ) : (
                  data?.subscribes.map((row) => {
                    const tone = subscribeTone(row.metaSubscribeStatus);
                    return (
                      <div key={row.id} className="rounded-[18px] border border-slate-800 bg-slate-950/75 px-4 py-4 text-sm text-slate-300">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{personLabel(row)}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                              {row.utmSource} · {row.utmMedium} · {row.utmCampaign}
                            </p>
                          </div>
                          <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${tone.border} ${tone.background} ${tone.text}`}>
                            <span className={`h-2 w-2 rounded-full ${tone.dot}`} /> {tone.label}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <p><span className="text-slate-500">Started:</span> {formatDateTime(row.startedAt)}</p>
                          <p><span className="text-slate-500">Joined:</span> {formatDateTime(row.joinedAt)}</p>
                          <p><span className="text-slate-500">Sent:</span> {formatDateTime(row.metaSubscribeSentAt)}</p>
                          <p><span className="text-slate-500">Event ID:</span> {shortValue(row.metaSubscribeEventId)}</p>
                          <p><span className="text-slate-500">Session:</span> {shortValue(row.sessionToken)}</p>
                          <p><span className="text-slate-500">FBCLID:</span> {shortValue(row.fbclid)}</p>
                          <p><span className="text-slate-500">FBP:</span> {shortValue(row.fbp)}</p>
                          <p><span className="text-slate-500">Session created:</span> {formatDateTime(row.sessionCreatedAt)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
