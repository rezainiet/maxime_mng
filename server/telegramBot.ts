const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "";

export type SendTelegramMessageResult = {
  ok: boolean;
  blocked: boolean;
  status: number;
  description?: string;
};

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
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
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
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

/**
 * Generate a single-use Telegram invite link for the configured channel.
 * Returns null on any failure — caller should fall back to the static
 * TELEGRAM_GROUP_URL so the funnel never breaks if the bot lacks permission.
 *
 * Requires the bot to be an admin in TELEGRAM_CHANNEL_ID with the
 * "Invite Users via Link" permission. Without this, the API returns 400
 * and we silently degrade to the static link.
 */
export async function createPerUserInviteLink(args: {
  telegramUserId: string;
  firstName?: string | null;
}): Promise<string | null> {
  if (!BOT_TOKEN || !CHANNEL_ID) return null;

  try {
    const name = `start:${args.telegramUserId}`.slice(0, 32);
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createChatInviteLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHANNEL_ID,
        name,
        member_limit: 1,
        // creates_join_request:false → user is added immediately, no admin approval queue
        creates_join_request: false,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { ok?: boolean; result?: { invite_link?: string }; description?: string }
      | null;

    if (!response.ok || payload?.ok === false || !payload?.result?.invite_link) {
      return null;
    }

    return payload.result.invite_link;
  } catch {
    return null;
  }
}
