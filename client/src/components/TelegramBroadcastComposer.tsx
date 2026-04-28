import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Megaphone, RefreshCcw, Send, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = { token: string };

const POLL_MS = 1500;

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const palette: Record<string, string> = {
    pending: "border-slate-600 bg-slate-900 text-slate-300",
    processing: "border-amber-500/50 bg-amber-500/10 text-amber-300",
    completed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    cancelled: "border-rose-500/50 bg-rose-500/10 text-rose-300",
  };
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
        palette[status] || "border-slate-700 bg-slate-900 text-slate-400"
      }`}
    >
      {status}
    </span>
  );
}

export function TelegramBroadcastComposer({ token }: Props) {
  const [draft, setDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);

  const recipientsQuery = trpc.dashboard.broadcastRecipientCount.useQuery(
    { token },
    { enabled: Boolean(token), refetchOnWindowFocus: false },
  );
  const historyQuery = trpc.dashboard.broadcastList.useQuery(
    { token },
    { enabled: Boolean(token), refetchOnWindowFocus: false, refetchInterval: POLL_MS * 3 },
  );

  // Poll the active job until it completes so the operator sees real-time
  // sent/blocked/failed counters tick up. We stop polling once the job leaves
  // the in-flight states. TanStack Query v5 passes the Query object (not the
  // data) into the refetchInterval callback, so we read data via
  // `query.state.data` to decide whether to keep polling.
  const activeJobQuery = trpc.dashboard.broadcastStatus.useQuery(
    { token, jobId: activeJobId ?? 0 },
    {
      enabled: Boolean(token) && activeJobId !== null,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data || "error" in data) return false;
        if (data.status === "completed" || data.status === "cancelled") return false;
        return POLL_MS;
      },
      refetchOnWindowFocus: false,
    },
  );

  const sendMutation = trpc.dashboard.broadcastSend.useMutation();

  const recipients =
    recipientsQuery.data && !("error" in recipientsQuery.data)
      ? recipientsQuery.data
      : null;
  const recipientCount = recipients?.count ?? 0;
  const messageMax = recipients?.messageMaxLength ?? 4096;

  const tooLong = draft.length > messageMax;
  const empty = draft.trim().length === 0;
  const canSubmit = !empty && !tooLong && recipientCount > 0 && !sendMutation.isPending;

  const activeJob =
    activeJobQuery.data && !("error" in activeJobQuery.data) ? activeJobQuery.data : null;

  const progressPct = useMemo(() => {
    if (!activeJob || activeJob.totalRecipients === 0) return 0;
    const done = activeJob.sentCount + activeJob.blockedCount + activeJob.failedCount;
    return Math.round((done / activeJob.totalRecipients) * 100);
  }, [activeJob]);

  // Reset the composer once the job completes — keep it visible for a beat so
  // the operator sees the final counters before it disappears.
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === "completed" || activeJob.status === "cancelled") {
      void historyQuery.refetch();
    }
  }, [activeJob, historyQuery]);

  const handleSubmit = async () => {
    setConfirmOpen(false);
    try {
      const result = await sendMutation.mutateAsync({ token, message: draft });
      if (!result.success) {
        toast.error("Broadcast not sent", { description: result.error });
        return;
      }
      toast.success(`Broadcast queued for ${result.recipients} subscribers`);
      setActiveJobId(result.jobId);
      setDraft("");
      void historyQuery.refetch();
    } catch (error) {
      toast.error("Broadcast failed", {
        description: error instanceof Error ? error.message : "Network error.",
      });
    }
  };

  const history =
    historyQuery.data && Array.isArray(historyQuery.data) ? historyQuery.data : [];

  return (
    <div className="space-y-4 lg:col-span-12">
      <div className="flex items-center justify-between rounded-[18px] border border-slate-800 bg-slate-900/95 px-4 py-3">
        <div className="flex items-center gap-2 text-amber-300">
          <Megaphone className="h-4 w-4" />
          <h3 className="text-lg font-semibold tracking-[-0.03em]">Broadcast — All bot subscribers</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            void recipientsQuery.refetch();
            void historyQuery.refetch();
          }}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs font-medium text-slate-200 transition hover:border-slate-500"
        >
          <RefreshCcw
            className={`h-3.5 w-3.5 ${
              recipientsQuery.isFetching || historyQuery.isFetching ? "animate-spin" : ""
            }`}
          />
          Refresh
        </button>
      </div>

      <section className="rounded-[18px] border border-cyan-500/40 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.10),transparent_38%),#0b1220] px-5 py-5 shadow-[0_0_0_1px_rgba(34,211,238,0.10)]">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-sm text-slate-300">
            Sends a single message to <strong className="text-white">every user</strong> who ran <code className="rounded bg-slate-900 px-1 text-cyan-300">/start</code> on the bot (excluding users who blocked it).
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-400">Recipients:</span>
          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-base font-semibold text-cyan-200">
            {recipientsQuery.isLoading ? "…" : recipientCount.toLocaleString("fr-FR")}
          </span>
          <span className="text-xs text-slate-500">bot subscribers</span>
        </div>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={7}
          placeholder="Write your broadcast here…"
          className="mt-4 w-full resize-y rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 outline-none transition focus:border-cyan-400"
          spellCheck={false}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
            <span>Variables:</span>
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-slate-300">{"{firstName}"}</code>
            <span className="text-slate-600">·</span>
            <span className={tooLong ? "text-rose-400" : "text-slate-500"}>
              {draft.length}/{messageMax} chars
            </span>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-500/60 bg-cyan-500/15 px-4 text-sm font-semibold text-cyan-100 transition enabled:hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Send to {recipientCount.toLocaleString("fr-FR")} subscribers
          </button>
        </div>

        {activeJob ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {activeJob.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                )}
                <span className="text-sm font-semibold text-white">
                  Job #{activeJob.id}
                </span>
                {statusBadge(activeJob.status)}
              </div>
              <span className="text-xs text-slate-400">
                {activeJob.sentCount + activeJob.blockedCount + activeJob.failedCount}/
                {activeJob.totalRecipients} processed
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-cyan-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <span className="text-slate-400">
                Sent: <strong className="text-emerald-300">{activeJob.sentCount}</strong>
              </span>
              <span className="text-slate-400">
                Blocked: <strong className="text-amber-300">{activeJob.blockedCount}</strong>
              </span>
              <span className="text-slate-400">
                Failed: <strong className="text-rose-300">{activeJob.failedCount}</strong>
              </span>
            </div>
          </div>
        ) : null}
      </section>

      {history.length > 0 ? (
        <section className="rounded-[18px] border border-slate-800 bg-slate-950/70 px-5 py-4">
          <h4 className="text-sm font-semibold text-white">Recent broadcasts</h4>
          <div className="mt-3 space-y-2">
            {history.map((job) => {
              const done = job.sentCount + job.blockedCount + job.failedCount;
              return (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-200">#{job.id}</span>
                      {statusBadge(job.status)}
                      <span className="text-[11px] text-slate-500">
                        {formatDateTime(job.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-400" title={job.messagePreview}>
                      {job.messagePreview}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-slate-500">
                      {done}/{job.totalRecipients}
                    </span>
                    <span className="text-emerald-300">✓ {job.sentCount}</span>
                    <span className="text-amber-300">⛔ {job.blockedCount}</span>
                    {job.failedCount > 0 ? (
                      <span className="text-rose-300">
                        <XCircle className="inline h-3 w-3" /> {job.failedCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cyan-500/40 bg-slate-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-lg font-semibold text-white">Confirm broadcast</h4>
            <p className="mt-2 text-sm text-slate-300">
              You're about to send this message to{" "}
              <strong className="text-cyan-300">{recipientCount.toLocaleString("fr-FR")}</strong>{" "}
              bot subscribers. This action cannot be undone.
            </p>
            <pre className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-200 whitespace-pre-wrap">
              {draft}
            </pre>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-9 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-slate-200 hover:border-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={sendMutation.isPending}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-500/60 bg-cyan-500/20 px-4 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
              >
                {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Confirm send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
