import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API_DIR = path.join(ROOT, "api");

const HOBBY_FUNCTIONS = [
  "admin/[resource].js",
  "auth/[route].js",
  "client-portal/[path].js",
  "company/[[...path]].js",
  "cron.js",
  "exchange-rates/[[...slug]].js",
  "payfast-handler.js",
  "payment-intents/[[...path]].js",
  "pos/[[...path]].js",
  "public-share.js",
  "subscriptions/[[...path]].js",
  "system.js",
];

describe("Vercel Hobby function ceiling", () => {
  it("keeps Paidly Pay on the existing POS function", () => {
    expect(fs.existsSync(path.join(API_DIR, "paidly.js"))).toBe(false);
    expect(fs.existsSync(path.join(API_DIR, "paidly"))).toBe(false);
    for (const file of HOBBY_FUNCTIONS) {
      expect(fs.existsSync(path.join(API_DIR, file))).toBe(true);
    }
    expect(HOBBY_FUNCTIONS).toHaveLength(12);
  });
});
