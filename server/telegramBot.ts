const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export type SendTelegramMessageResult = {
  ok: boolean;
  blocked: boolean;
  status: number;
  description?: string;
};

// Telegram inline keyboard shape — kept loose because we only build URL buttons.
// The Telegram API accepts any JSON-serializable object here.
export type TelegramReplyMarkup = Record<string, unknown>;

export type SendTelegramMessageOptions = {
  replyMarkup?: TelegramReplyMarkup | null;
  // Default true — we always send rich text. Override only if a future caller
  // needs plain text (e.g. for messages with literal `<` characters).
  parseMode?: "HTML" | "Markdown" | "MarkdownV2" | null;
  // Default true to keep messages compact. Reminders/welcomes don't want
  // Telegram's preview card stealing focus from the join button.
  disableWebPagePreview?: boolean;
};

/**
 * Build the inline keyboard with a single URL button that opens the private
 * group. Used by the welcome, the 7 reminders, and broadcasts so every
 * user-facing bot message exposes a consistent join CTA.
 */
export function buildJoinGroupKeyboard(groupUrl: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚀 Rejoindre le groupe privé", url: groupUrl }],
    ],
  };
}

export type CreatePersonalInviteLinkArgs = {
  chatId: string | number;
  telegramUserId: string;
  // Expiry in seconds from now. Default 30d so the link survives the full
  // reminder sequence (15min → 1m).
  expireSeconds?: number;
};

export type CreatePersonalInviteLinkResult =
  | { ok: true; inviteLink: string; expiresAt: Date }
  | { ok: false; error: string };

/**
 * Create a per-user channel invite link with `creates_join_request=true` so
 * every click routes through the chat_join_request webhook for explicit bot
 * approval. The bot rejects requests from users without a bot_starts row,
 * which is what enforces "all users must /start". Caller should fall back to
 * the static group URL if this fails (transient API error, etc.) — better to
 * ship a working welcome than to block the flow.
 *
 * NOTE: Telegram's API forbids `member_limit` when `creates_join_request=true`,
 * so single-use is replaced by the approval gate (which is strictly stronger).
 */
export async function createPersonalInviteLink(
  args: CreatePersonalInviteLinkArgs,
): Promise<CreatePersonalInviteLinkResult> {
  if (!BOT_TOKEN) return { ok: false, error: "missing_bot_token" };

  const expireSeconds = args.expireSeconds ?? 30 * 24 * 60 * 60;
  const expireDate = Math.floor(Date.now() / 1000) + expireSeconds;
  const body: Record<string, unknown> = {
    chat_id: args.chatId,
    creates_join_request: true,
    name: `user:${args.telegramUserId}`.slice(0, 32),
    expire_date: expireDate,
  };

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createChatInviteLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string; result?: { invite_link?: string } }
      | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error: payload?.description || `HTTP ${response.status}`,
      };
    }
    const link = payload?.result?.invite_link;
    if (typeof link !== "string" || !link) {
      return { ok: false, error: "no_invite_link_in_response" };
    }
    return {
      ok: true,
      inviteLink: link,
      expiresAt: new Date(expireDate * 1000),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type ApproveJoinRequestArgs = {
  chatId: string | number;
  telegramUserId: string | number;
};

export type ApproveJoinRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export async function approveChatJoinRequest(
  args: ApproveJoinRequestArgs,
): Promise<ApproveJoinRequestResult> {
  if (!BOT_TOKEN) return { ok: false, error: "missing_bot_token" };
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/approveChatJoinRequest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: args.chatId,
          user_id: args.telegramUserId,
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error: payload?.description || `HTTP ${response.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function declineChatJoinRequest(
  args: ApproveJoinRequestArgs,
): Promise<ApproveJoinRequestResult> {
  if (!BOT_TOKEN) return { ok: false, error: "missing_bot_token" };
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/declineChatJoinRequest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: args.chatId,
          user_id: args.telegramUserId,
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        error: payload?.description || `HTTP ${response.status}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  options?: SendTelegramMessageOptions,
): Promise<SendTelegramMessageResult> {
  if (!BOT_TOKEN) {
    return {
      ok: false,
      blocked: false,
      status: 500,
      description: "Bot token not configured",
    };
  }

  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode === undefined ? "HTML" : options.parseMode,
      disable_web_page_preview:
        options?.disableWebPagePreview === undefined ? true : options.disableWebPagePreview,
    };
    if (options?.replyMarkup) {
      body.reply_markup = options.replyMarkup;
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; description?: string; error_code?: number }
      | null;

    const description = payload?.description || response.statusText || "Unknown Telegram error";
    const blocked = response.status === 403 || /blocked by the user/i.test(description);

    if (!response.ok || payload?.ok === false) {
      return {
        ok: false,
        blocked,
        status: payload?.error_code || response.status,
        description,
      };
    }

    return {
      ok: true,
      blocked: false,
      status: response.status,
      description,
    };
  } catch (error) {
    return {
      ok: false,
      blocked: false,
      status: 500,
      description: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}
