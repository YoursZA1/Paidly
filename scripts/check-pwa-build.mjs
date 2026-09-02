#!/usr/bin/env node
/**
 * Fail the production build if Workbox SPA fallback cannot resolve the Vite shell.
 * `createHandlerBoundToURL` throws non-precached-url when index.html is missing
 * from the precache manifest (blank /pos, /dashboard, etc. after SW takes control).
 */
import fs from "node:fs";
import path from "node:path";

const swPath = path.resolve("dist/sw.js");
if (!fs.existsSync(swPath)) {
  console.error("[check-pwa-build] dist/sw.js was not generated");
  process.exit(1);
}

const sw = fs.readFileSync(swPath, "utf8");
const precacheUrls = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
const htmlEntries = precacheUrls.filter((url) => /(^|\/)index\.html$/.test(url));
if (htmlEntries.length === 0) {
  console.error("[check-pwa-build] Workbox precache does not include index.html");
  process.exit(1);
}

const bound = sw.match(/createHandlerBoundToURL\(\s*["']([^"']+)["']\s*\)/);
if (!bound) {
  console.error("[check-pwa-build] createHandlerBoundToURL was not generated");
  process.exit(1);
}

const normalize = (url) => String(url || "").replace(/^\//, "");
if (normalize(bound[1]) !== normalize(htmlEntries[0])) {
  console.error(
    `[check-pwa-build] navigateFallback ${bound[1]} does not match precache ${htmlEntries[0]}`
  );
  process.exit(1);
}

if (sw.includes("paidly-shell")) {
  console.error("[check-pwa-build] unexpected paidly-shell navigation runtime cache");
  process.exit(1);
}

console.info(`[check-pwa-build] ok — shell ${htmlEntries[0]} bound as ${bound[1]}`);
