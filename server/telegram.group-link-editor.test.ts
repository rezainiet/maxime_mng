import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replaceTelegramGroupUrlInText } from "./telegramGroupLink";

const dashboardSource = fs.readFileSync(
  path.resolve(import.meta.dirname, "../client/src/pages/Dashboard.tsx"),
  "utf-8",
);
const routerSource = fs.readFileSync(path.resolve(import.meta.dirname, "./routers.ts"), "utf-8");

describe("telegram group link editor", () => {
  it("replaces placeholders and legacy Telegram links with the newest group URL", () => {
    const nextUrl = "https://t.me/new_private_group";

    expect(
      replaceTelegramGroupUrlInText("Join here -> {group_url}", nextUrl),
    ).toContain(nextUrl);
    expect(
      replaceTelegramGroupUrlInText(
        "Join here -> https://t.me/+sdIa7KNoIbNjMTg0 and keep going",
        nextUrl,
      ),
    ).toBe(`Join here -> ${nextUrl} and keep going`);
    expect(
      replaceTelegramGroupUrlInText(
        "Old joinchat link https://telegram.me/joinchat/legacyHash and ok",
        nextUrl,
      ),
    ).toBe(`Old joinchat link ${nextUrl} and ok`);
  });

  it("preserves bot and contact handles that are not invite links", () => {
    // Replacing every t.me URL would clobber the @MAXIME_SPECIALISTEM contact
    // line, the Misternb_bot deeplink, etc. Only invite-style URLs should be
    // rewritten when the group URL setting changes.
    const nextUrl = "https://t.me/+brand_new_invite";
    const stored =
      "Welcome! Join https://t.me/+old_invite — questions? https://t.me/MisterBNMB or https://t.me/Misternb_bot?start=abc";

    const out = replaceTelegramGroupUrlInText(stored, nextUrl);

    expect(out).toContain(nextUrl);
    expect(out).toContain("https://t.me/MisterBNMB");
    expect(out).toContain("https://t.me/Misternb_bot?start=abc");
    expect(out).not.toContain("https://t.me/+old_invite");
  });

  it("adds a dashboard control and save button for editing the Telegram group link", () => {
    expect(dashboardSource).toContain("Telegram link editor");
    expect(dashboardSource).toContain("telegram-group-url");
    expect(dashboardSource).toContain("Save latest changes");
    expect(dashboardSource).toContain('key: "telegram_group_url"');
  });

  it("syncs pending bot content immediately when the Telegram group link setting is saved", () => {
    expect(routerSource).toContain("TELEGRAM_GROUP_URL_SETTING_KEY");
    expect(routerSource).toContain("syncTelegramGroupUrlContent");
    expect(routerSource).toContain("input.key === TELEGRAM_GROUP_URL_SETTING_KEY");
  });
});
