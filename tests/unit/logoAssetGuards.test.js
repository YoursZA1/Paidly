import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../..");
const logoPath = join(repoRoot, "src/components/shared/Logo.jsx");
const logoImagePath = join(repoRoot, "src/components/shared/LogoImage.jsx");

describe("logo asset guards (no React vs DOM src fights)", () => {
  it("Logo.jsx does not assign currentTarget.src in onError", () => {
    const src = readFileSync(logoPath, "utf8");
    expect(src).not.toMatch(/currentTarget\.src\s*=/);
    expect(src).toMatch(/setDisplaySrc/);
  });

  it("LogoImage.jsx uses markStorageAssetFailed (global guard) and no imperative DOM src swaps", () => {
    const src = readFileSync(logoImagePath, "utf8");
    expect(src).not.toMatch(/currentTarget\.src\s*=/);
    expect(src).toMatch(/markStorageAssetFailed/);
    expect(src).toMatch(/terminalRef/);
  });
});
