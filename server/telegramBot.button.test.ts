import { describe, expect, it } from "vitest";
import { buildJoinGroupKeyboard } from "./telegramBot";

describe("buildJoinGroupKeyboard", () => {
  it("returns a single-row inline keyboard with the join URL", () => {
    const url = "https://t.me/+vEpfuMbiqvkzZGE8";
    const keyboard = buildJoinGroupKeyboard(url);

    expect(keyboard).toEqual({
      inline_keyboard: [
        [{ text: "🚀 Rejoindre le groupe privé", url }],
      ],
    });
  });

  it("propagates whatever URL is passed (admin can switch invite links)", () => {
    const keyboard = buildJoinGroupKeyboard("https://t.me/+otherInvite") as {
      inline_keyboard: Array<Array<{ url: string }>>;
    };
    expect(keyboard.inline_keyboard[0][0].url).toBe("https://t.me/+otherInvite");
  });
});
