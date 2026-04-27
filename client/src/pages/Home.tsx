import React, { useEffect, useMemo, useState } from "react";
import {
  TELEGRAM_BOT_DEEP_LINK,
  TELEGRAM_BOT_URL,
  TrackingSession,
  buildFallbackTrackingSession,
  initAdvancedTracking,
  trackTelegramClick,
  trackTelegramGroupClick,
} from "@/lib/tracking";

const FUNNEL_STORAGE_KEY = "misterb_funnel_token";

function readPersistedFunnelToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(FUNNEL_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

const telegramUrl = "https://t.me/MAXIME_SPECIALISTEM";

// NOTE: Demo / social-proof content, not real-time data. The rotation only
// animates the toast — it does not reflect live joins. Wire to
// dashboard.subscriberLog if you ever need real activity.
const socialNotifications = [
  { id: "ahmed-tg", name: "Ahmed", detail: "s’est abonné Telegram" },
  { id: "sophie-vip", name: "Sophie", detail: "a rejoint le VIP" },
  { id: "lucas-tg", name: "Lucas", detail: "a écrit sur Telegram" },
  { id: "marie-tg", name: "Marie", detail: "vient de s’abonner" },
  { id: "mehdi-tg", name: "Mehdi", detail: "vient de cliquer sur Telegram" },
  { id: "sofia-msg", name: "Sofia", detail: "vient d’écrire à Maxime" },
  { id: "antoine-group", name: "Antoine", detail: "a rejoint le groupe" },
  { id: "yasmine-news", name: "Yasmine", detail: "vient de demander les nouveautés" },
  { id: "karim-group", name: "Karim", detail: "a rejoint le groupe privé" },
  { id: "lea-tg", name: "Léa", detail: "vient de cliquer sur Telegram" },
  { id: "amine-msg", name: "Amine", detail: "vient d’écrire à Maxime" },
  { id: "giulia-vip", name: "Giulia", detail: "vient de rejoindre la liste VIP" },
  { id: "nora-group", name: "Nora", detail: "a rejoint le groupe" },
  { id: "samir-tg", name: "Samir", detail: "vient de cliquer sur Telegram" },
];

type SocialNotification = (typeof socialNotifications)[number];

function shuffleNotifications(list: SocialNotification[]) {
  const copied = [...list];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copied[index], copied[randomIndex]] = [copied[randomIndex], copied[index]];
  }
  return copied;
}

function buildVisitSequence() {
  if (typeof window === "undefined") {
    return socialNotifications;
  }
  const shuffled = shuffleNotifications(socialNotifications);
  const lastFirstToastId = window.localStorage.getItem("misterb-last-toast-id");
  if (shuffled.length > 1 && shuffled[0].id === lastFirstToastId) {
    const firstItem = shuffled.shift();
    if (firstItem) shuffled.push(firstItem);
  }
  window.localStorage.setItem("misterb-last-toast-id", shuffled[0].id);
  return shuffled;
}

function TelegramIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={className}>
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <path
        fill="#fff"
        d="M23.97 9.18 21.58 22.3c-.18.93-.66 1.16-1.33.72l-4.28-3.16-2.06 1.98c-.23.23-.42.42-.86.42l.31-4.39 8-7.23c.35-.31-.07-.49-.54-.18l-9.89 6.22-4.26-1.33c-.93-.29-.95-.93.19-1.38L22.62 8c.73-.27 1.36.18 1.12 1.18Z"
      />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px] shrink-0 drop-shadow-[0_2px_4px_rgba(29,155,240,0.45)]"
    >
      <path
        fill="#1d9bf0"
        d="M12 1.5 14.5 4l3.5-.4 1.4 3.2 3.1 1.7-.6 3.5L23 15l-1.4 3.2-3.1 1.7-1.4 3.2-3.5-.4L12 24l-2.5-2.5-3.5.4-1.4-3.2-3.1-1.7.6-3.5L1 9l1.4-3.2 3.1-1.7L7 .9l3.5.4z"
      />
      <path
        fill="#fff"
        d="m10.6 15.4-3-3 1.4-1.4 1.6 1.6 4.6-4.6 1.4 1.4z"
      />
    </svg>
  );
}

type CtaButtonProps = {
  href: string;
  label: string;
  variant: "primary" | "secondary";
  onTrack: (event: React.MouseEvent<HTMLAnchorElement>) => void | Promise<void>;
  openInSameTab?: boolean;
  trailing?: string;
};

function CtaButton({ href, label, variant, onTrack, openInSameTab = false, trailing }: CtaButtonProps) {
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    void onTrack(event);
  };

  const base =
    "group relative flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-[0.95rem] font-[650] tracking-[-0.01em] transition-all duration-200 active:scale-[0.985]";

  const styles =
    variant === "primary"
      ? "bg-gradient-to-br from-[#ff4747] via-[#e60000] to-[#a60000] text-white shadow-[0_12px_28px_rgba(230,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.30)] hover:shadow-[0_16px_36px_rgba(230,0,0,0.60),inset_0_1px_0_rgba(255,255,255,0.40)] hover:-translate-y-[2px]"
      : "border border-white/12 bg-white/[0.04] text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md hover:bg-white/[0.07] hover:border-white/20";

  return (
    <a
      href={href}
      target={openInSameTab ? "_self" : "_blank"}
      rel={openInSameTab ? undefined : "noreferrer"}
      data-direct-open={openInSameTab ? "telegram-bot" : undefined}
      onClick={handleClick}
      className={`${base} ${styles}`}
    >
      <TelegramIcon
        className={`h-7 w-7 ${variant === "primary" ? "text-[#a60000]" : "text-[#2AABEE]"}`}
      />
      <span className="uppercase tracking-[0.02em]">{label}</span>
      {trailing ? (
        <span aria-hidden="true" className="text-base">
          {trailing}
        </span>
      ) : null}
    </a>
  );
}

function shouldPreferTelegramDeepLink() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function getTelegramGroupHref(session?: TrackingSession | null) {
  const preferDeepLink = shouldPreferTelegramDeepLink();

  if (session) {
    return preferDeepLink ? session.telegramDeepLink : session.telegramBotUrl;
  }

  const funnelToken = readPersistedFunnelToken();
  if (funnelToken) {
    const fallback = buildFallbackTrackingSession(funnelToken);
    return preferDeepLink ? fallback.telegramDeepLink : fallback.telegramBotUrl;
  }

  return preferDeepLink ? TELEGRAM_BOT_DEEP_LINK : TELEGRAM_BOT_URL;
}

export default function Home() {
  const notifications = useMemo(() => buildVisitSequence(), []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const [telegramGroupHref, setTelegramGroupHref] = useState<string>(getTelegramGroupHref());
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setHasMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    void initAdvancedTracking().then((session) => {
      setTelegramGroupHref(getTelegramGroupHref(session));
    });
  }, []);

  useEffect(() => {
    const initialTimeout = window.setTimeout(() => setIsToastVisible(true), 1400);
    let fadeTimeout: number | undefined;
    const interval = window.setInterval(() => {
      setIsToastVisible(false);
      fadeTimeout = window.setTimeout(() => {
        setActiveIndex((currentIndex) => (currentIndex + 1) % notifications.length);
        setIsToastVisible(true);
      }, 280);
    }, 4500);

    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(interval);
      if (fadeTimeout) window.clearTimeout(fadeTimeout);
    };
  }, [notifications.length]);

  const activeToast = notifications[activeIndex];

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#0a0405] text-white">
      <style>{`
        @keyframes maximeFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes maximePulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50%      { transform: scale(1.18); opacity: 1; }
        }
        @keyframes maximeRingSpin {
          to { transform: rotate(360deg); }
        }
        .maxime-stagger > * {
          opacity: 0;
          animation: maximeFadeUp 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .maxime-stagger > *:nth-child(1) { animation-delay: 0.05s; }
        .maxime-stagger > *:nth-child(2) { animation-delay: 0.18s; }
        .maxime-stagger > *:nth-child(3) { animation-delay: 0.30s; }
        .maxime-stagger > *:nth-child(4) { animation-delay: 0.42s; }
        .maxime-stagger > *:nth-child(5) { animation-delay: 0.54s; }
        .maxime-stagger > *:nth-child(6) { animation-delay: 0.66s; }
      `}</style>

      {/* Mesh gradient background — red on black, matches logo palette */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[18%] -top-[12%] h-[55vh] w-[55vh] rounded-full bg-[#ff1f1f] opacity-[0.32] blur-[120px]" />
        <div className="absolute right-[-18%] top-[6%] h-[48vh] w-[48vh] rounded-full bg-[#d40606] opacity-[0.36] blur-[130px]" />
        <div className="absolute left-[6%] bottom-[-20%] h-[60vh] w-[60vh] rounded-full bg-[#8a0202] opacity-[0.40] blur-[140px]" />
        <div className="absolute right-[8%] bottom-[8%] h-[36vh] w-[36vh] rounded-full bg-[#ff5252] opacity-[0.18] blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.45)_100%)]" />
      </div>

      <section
        id="hero-section"
        className="relative mx-auto flex min-h-[100svh] w-full max-w-[440px] flex-col items-center justify-center px-5 py-10 text-center"
      >
        <div
          className={`maxime-stagger w-full ${hasMounted ? "" : "invisible"} rounded-[28px] border border-white/10 bg-white/[0.045] p-7 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:p-8`}
        >
          {/* Avatar / logo with red glow ring + online dot */}
          <div className="flex justify-center">
            <div className="relative">
              <div
                aria-hidden="true"
                className="absolute -inset-[6px] rounded-full bg-[radial-gradient(circle,rgba(255,40,40,0.55)_0%,rgba(255,40,40,0)_70%)] blur-md"
              />
              <div
                aria-hidden="true"
                className="absolute -inset-[2px] rounded-full bg-[conic-gradient(from_120deg,#ff4d4d,#b30000,#ff7a7a,#ff4d4d)] opacity-95"
              />
              <img
                src="/maxime-logo.png"
                alt="Logo MAXIME Spécialiste"
                width={120}
                height={120}
                loading="eager"
                decoding="async"
                className="relative h-[120px] w-[120px] rounded-full object-cover shadow-[0_18px_40px_rgba(190,10,10,0.45)] ring-1 ring-white/10"
              />
              <span
                aria-hidden="true"
                className="absolute -bottom-1 right-0 flex h-[24px] w-[24px] items-center justify-center rounded-full border-2 border-[#0a0405] bg-[#22c55e] shadow-[0_2px_8px_rgba(34,197,94,0.55)]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white/95" />
              </span>
            </div>
          </div>

          {/* Name + verified badge */}
          <div className="mt-5 flex items-center justify-center gap-2">
            <h1 className="text-[2.2rem] font-[800] leading-none tracking-[-0.045em] text-white sm:text-[2.4rem]">
              MAXIME
            </h1>
            <VerifiedBadge />
          </div>

          {/* Trust strip */}
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[0.72rem] font-medium tracking-wide text-white/80">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75"
                style={{ animation: "maximePulse 2.4s ease-in-out infinite" }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
            </span>
            En ligne · Communauté privée active
          </div>

          {/* Subtitle */}
          <p className="mx-auto mt-5 max-w-[320px] text-[1.02rem] font-[500] leading-[1.4] tracking-[-0.018em] text-white/82">
            Voici tous les liens pour rejoindre mes comptes et groupes <span aria-hidden="true">✅</span>
          </p>

          {/* CTAs */}
          <div id="cta-group" className="mt-6 w-full space-y-3">
            <CtaButton
              href={telegramGroupHref}
              label="Groupe Telegram"
              trailing="✅"
              variant="primary"
              openInSameTab
              onTrack={async (event) => {
                event.preventDefault();
                const session = await trackTelegramGroupClick("telegram_group_cta");
                // trackTelegramGroupClick is guaranteed to return a session whose
                // telegramBotUrl already contains a non-empty `?start=` payload
                // (real session OR funnelToken-only fallback). Trust that — never
                // fall back to a payload-less bot URL here.
                const targetHref = getTelegramGroupHref(session);
                setTelegramGroupHref(targetHref);
                window.location.assign(targetHref);
              }}
            />
            <CtaButton
              href={telegramUrl}
              label="Me contacter"
              variant="secondary"
              openInSameTab
              onTrack={async (event) => {
                event.preventDefault();
                try {
                  await trackTelegramClick("telegram_contact_cta");
                } finally {
                  window.location.assign(telegramUrl);
                }
              }}
            />
          </div>

          {/* Footer */}
          <div className="mt-7 flex flex-col items-center gap-1.5">
            <p className="text-[0.74rem] font-medium tracking-[-0.01em] text-white/40">Join Maxime</p>
            <a
              href="/dashboard"
              className="text-[0.62rem] font-medium uppercase tracking-[0.18em] text-white/30 transition hover:text-white/60"
            >
              Accès suivi privé
            </a>
          </div>
        </div>
      </section>

      {/* Live activity chip — bottom center */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-4 sm:bottom-6">
        <div
          aria-live="polite"
          className={`flex max-w-[320px] items-center gap-2.5 rounded-full border border-white/10 bg-black/45 px-3.5 py-2 text-left shadow-[0_10px_24px_rgba(0,0,0,0.4)] backdrop-blur-xl transition-all duration-300 ${
            isToastVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22c55e]" />
          </span>
          <p className="truncate text-[0.72rem] font-medium tracking-[-0.005em] text-white/90">
            <span className="font-[650] text-white">{activeToast.name}</span>{" "}
            <span className="text-white/65">{activeToast.detail}</span>
          </p>
        </div>
      </div>
    </main>
  );
}
