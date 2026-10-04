import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("send-invoice Vercel route", () => {
  it("rewrites /api/send-invoice onto the existing system function", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8"));
    const rewrite = (vercel.rewrites || []).find((row) => row.source === "/api/send-invoice");
    expect(rewrite?.destination).toBe("/api/system?op=send-invoice");
  });
});
