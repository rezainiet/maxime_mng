// =============================================================================
// Runtime HTML env injection
// -----------------------------------------------------------------------------
// Replaces {{TOKEN}} markers in the served index.html from process.env at
// REQUEST time. This keeps runtime-configurable values (notably the Meta Pixel
// ID) env-driven: changing a Railway variable and restarting updates the served
// HTML with NO code change and NO rebuild. Vite intentionally does not touch
// {{...}} markers at build time, so they survive into dist/public/index.html
// and are resolved here on every request.
// =============================================================================

/**
 * Resolve a single {{TOKEN}} marker from the environment.
 *
 * META_PIXEL_ID is the single source of truth for both the browser pixel and
 * the server CAPI. It falls back to the legacy VITE_META_PIXEL_ID only for
 * safety during migration. Unknown / unset tokens resolve to an empty string so
 * markers are never left visible in the served HTML.
 */
function resolveToken(token: string, env: NodeJS.ProcessEnv): string {
  if (token === "META_PIXEL_ID") {
    return env.META_PIXEL_ID || env.VITE_META_PIXEL_ID || "";
  }
  return env[token] ?? "";
}

/**
 * Replace every {{TOKEN}} marker in the given HTML using process.env (or a
 * supplied env map for testing). Blanks unset markers so no leftover {{ }}
 * survives into the response.
 */
export function injectHtmlEnv(
  html: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return html.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, token: string) =>
    resolveToken(token, env)
  );
}
