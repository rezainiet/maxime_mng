# Maxime landing + Telegram funnel

Express + Vite (React) app with a Telegram bot funnel and Meta Pixel /
Conversions API tracking. Deployed on Railway via `railway up`.

## Local development

```bash
cp .env.example .env   # fill in what you need
pnpm install
pnpm dev               # Vite middleware + Express on PORT (default 3000)
```

Run the test suite with `pnpm test` and type-check with `pnpm exec tsc --noEmit`.

## Meta Pixel & Conversions API — single, runtime env-driven source

`META_PIXEL_ID` is the **single source of truth** and drives **both** the
browser pixel and the server Conversions API (CAPI). It is read at **request
time**, so changing it on Railway and restarting takes effect with **no code
change and no rebuild**.

| Variable | Used by | Notes |
| --- | --- | --- |
| `META_PIXEL_ID` | Browser pixel **and** server CAPI | Injected into `index.html` at request time |
| `META_CONVERSIONS_TOKEN` | Server CAPI | Access token authorized for the pixel |

How it works:

- `client/index.html` carries a `{{META_PIXEL_ID}}` marker (in both the `fbq`
  init and the `<noscript>` fallback `<img>`). Vite does **not** touch `{{...}}`
  markers, so they survive the build into `dist/public/index.html`.
- `server/_core/htmlEnv.ts` (`injectHtmlEnv`) replaces those markers from
  `process.env` on every request — wired into both the production static path
  and the Vite dev middleware (`server/_core/vite.ts`). When `META_PIXEL_ID` is
  unset the marker is blanked and the guard in `index.html` skips loading
  `fbevents.js`.
- The server CAPI (`server/metaCapi.ts`) reads the same `META_PIXEL_ID`, so the
  browser and server events share one id and Meta dedupes them.

> The legacy build-time `VITE_META_PIXEL_ID` has been removed. `injectHtmlEnv`
> still falls back to it only as a safety net during migration — do not
> reintroduce it.

### Routine change for a new pixel / token (Railway)

```bash
railway variables --set "META_PIXEL_ID=<new>" --set "META_CONVERSIONS_TOKEN=<new>"
railway redeploy   # restart only — no rebuild
```

After deploy, verify the live HTML serves the new id:

```bash
curl -s https://<your-domain>/ | grep _pixelId
```

and confirm the token is authorized by POSTing one test PageView:

```bash
curl "https://graph.facebook.com/v21.0/<PIXEL_ID>/events?access_token=<TOKEN>" \
  -d '{"data":[{"event_name":"PageView","event_time":<unix>,"action_source":"website","event_source_url":"https://<your-domain>/"}]}'
# expect: {"events_received":1,...}
```
