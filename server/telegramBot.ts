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
