#!/usr/bin/env node
/**
 * Static server for the isolated lab apps.
 * Serves apps/labs plus the compiled Learning SDK at /sdk/learning-sdk.js.
 * The labs run on a different origin (port) from the Next.js app.
 */
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { networkInterfaces } from "node:os";
import { config as loadEnv } from "dotenv";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: ".env.local" });
loadEnv();

const root = resolve(fileURLToPath(new URL("../apps/labs", import.meta.url)));
const sdkFile = resolve(
  fileURLToPath(new URL("../packages/learning-sdk/dist/learning-sdk.js", import.meta.url)),
);
const port = Number(process.env.LABS_PORT ?? 4310);
const bindHost = process.env.LABS_BIND_HOST ?? process.env.APP_BIND_HOST ?? "0.0.0.0";
const appOrigins = (process.env.LABS_PARENT_ORIGINS ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const appPort = (() => {
  try {
    return new URL(appOrigins[0]).port || "3000";
  } catch {
    return "3000";
  }
})();
const lanOrigins = Object.values(networkInterfaces())
  .flat()
  .filter((info) => info && info.family === "IPv4" && !info.internal)
  .map((info) => `http://${info.address}:${appPort}`);
const parentOrigins = [
  ...new Set([...appOrigins, `http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`, ...lanOrigins]),
];
const appOrigin = appOrigins[0] ?? "http://localhost:3000";

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);
const compressedCache = new Map();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/sdk/learning-sdk.js") {
      const body = await readFile(sdkFile);
      const acceptsGzip = /gzip/.test(request.headers["accept-encoding"] ?? "");
      const payload = acceptsGzip ? gzipSync(body) : body;
      response.writeHead(200, {
        "Content-Type": MIME[".js"],
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": appOrigin,
        "Vary": "Accept-Encoding",
        ...(acceptsGzip ? { "Content-Encoding": "gzip" } : {}),
      });
      response.end(payload);
      return;
    }

    if (pathname.endsWith("/")) pathname += "index.html";
    const target = resolve(join(root, normalize(pathname)));
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    let filePath = target;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }

    const body = await readFile(filePath);
    const extension = extname(filePath);
    const acceptsGzip = /gzip/.test(request.headers["accept-encoding"] ?? "");
    let payload = body;
    if (acceptsGzip && COMPRESSIBLE.has(extension)) {
      const key = `${filePath}:${body.length}`;
      payload = compressedCache.get(key);
      if (!payload) {
        payload = gzipSync(body);
        compressedCache.set(key, payload);
      }
    }
    response.writeHead(200, {
      "Content-Type": MIME[extension] ?? "application/octet-stream",
      "Cache-Control":
        extension === ".html"
          ? "no-store"
          : "public, max-age=300, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Vary": "Accept-Encoding",
      ...(payload !== body ? { "Content-Encoding": "gzip" } : {}),
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        `frame-ancestors ${parentOrigins.join(" ")}`,
        "base-uri 'none'",
        "object-src 'none'",
      ].join("; "),
    });
    response.end(payload);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Server error");
  }
});

server.listen(port, bindHost, () => {
  console.log(`Labs listening on ${bindHost}:${port}`);
  console.log(`Parent origins allowed: ${parentOrigins.join(", ")}`);
  for (const info of Object.values(networkInterfaces()).flat()) {
    if (info && info.family === "IPv4" && !info.internal) {
      console.log(`  network: http://${info.address}:${port}`);
    }
  }
});
