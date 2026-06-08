import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { injectHtmlEnv } from "./_core/htmlEnv";

const clientHtml = readFileSync(
  resolve(import.meta.dirname, "../client/index.html"),
  "utf8"
);

describe("runtime HTML env injection (Meta Pixel single source of truth)", () => {
  it("ships a {{META_PIXEL_ID}} marker in index.html for both the fbq init and the noscript fallback", () => {
    expect(clientHtml).toContain('var _misterbPixelId = "{{META_PIXEL_ID}}"');
    expect(clientHtml).toContain("facebook.com/tr?id={{META_PIXEL_ID}}");
    // No leftover Vite build-time placeholder.
    expect(clientHtml).not.toContain("%VITE_META_PIXEL_ID%");
  });

  it("replaces {{META_PIXEL_ID}} from META_PIXEL_ID at request time with zero leftover markers", () => {
    const out = injectHtmlEnv(clientHtml, { META_PIXEL_ID: "1234567890" } as NodeJS.ProcessEnv);
    expect(out).toContain('var _misterbPixelId = "1234567890"');
    expect(out).toContain("facebook.com/tr?id=1234567890");
    expect(out).not.toContain("{{META_PIXEL_ID}}");
  });

  it("falls back to VITE_META_PIXEL_ID only when META_PIXEL_ID is unset", () => {
    const out = injectHtmlEnv('id="{{META_PIXEL_ID}}"', {
      VITE_META_PIXEL_ID: "9999",
    } as NodeJS.ProcessEnv);
    expect(out).toBe('id="9999"');
  });

  it("prefers META_PIXEL_ID over the legacy VITE_META_PIXEL_ID", () => {
    const out = injectHtmlEnv('id="{{META_PIXEL_ID}}"', {
      META_PIXEL_ID: "primary",
      VITE_META_PIXEL_ID: "legacy",
    } as NodeJS.ProcessEnv);
    expect(out).toBe('id="primary"');
  });

  it("blanks the marker when the pixel id is unset so fbevents never loads", () => {
    const out = injectHtmlEnv(clientHtml, {} as NodeJS.ProcessEnv);
    expect(out).toContain('var _misterbPixelId = ""');
    expect(out).not.toContain("{{META_PIXEL_ID}}");
    // The guard keys off an empty string, so the pixel bootstrap is skipped.
    expect(out).toContain('if (_misterbPixelId && _misterbPixelId.indexOf("{") !== 0)');
  });
});
