import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { injectHtmlEnv } from "./htmlEnv";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const transformed = await vite.transformIndexHtml(url, template);
      // Inject {{TOKEN}} markers (e.g. {{META_PIXEL_ID}}) from env so dev
      // mirrors production runtime injection.
      const page = injectHtmlEnv(transformed);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  const indexPath = path.resolve(distPath, "index.html");

  // Serve index.html with runtime env injection on EVERY request. We read the
  // file per request (not at startup) and inject {{TOKEN}} markers from env so
  // a Railway variable change + restart updates the served HTML with no rebuild.
  // Cache-Control: no-cache prevents a stale pixel id being held by the browser.
  const sendInjectedIndex: express.RequestHandler = (_req, res, next) => {
    fs.promises
      .readFile(indexPath, "utf-8")
      .then((html) => {
        res
          .status(200)
          .set({ "Content-Type": "text/html", "Cache-Control": "no-cache" })
          .end(injectHtmlEnv(html));
      })
      .catch(next);
  };

  // "/" and "/index.html" must go through the injector, never the raw file.
  app.get("/", sendInjectedIndex);
  app.get("/index.html", sendInjectedIndex);

  // Serve hashed assets, but `index: false` ensures express.static never
  // returns the un-injected index.html for "/" or a directory request.
  app.use(express.static(distPath, { index: false }));

  // SPA fallback: any unmatched route renders the injected index.html.
  app.use("*", sendInjectedIndex);
}
