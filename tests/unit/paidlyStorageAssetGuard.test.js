import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __clearStorageAssetFailuresForTests,
  isStorageAssetKnownFailed,
  isValidLogoStorageObjectKey,
  markStorageAssetFailed,
  normalizeAssetUrlKey,
} from "@/lib/paidlyStorageAssetGuard";

describe("paidlyStorageAssetGuard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __clearStorageAssetFailuresForTests();
  });

  it("normalizeAssetUrlKey strips query and hash", () => {
    expect(normalizeAssetUrlKey("https://x/y/z.png?v=1#h")).toBe("https://x/y/z.png");
  });

  it("rejects path traversal and invalid keys", () => {
    expect(isValidLogoStorageObjectKey("")).toBe(false);
    expect(isValidLogoStorageObjectKey("../etc/passwd")).toBe(false);
    expect(isValidLogoStorageObjectKey("/abs")).toBe(false);
    expect(isValidLogoStorageObjectKey("a//b")).toBe(false);
    expect(isValidLogoStorageObjectKey("user-id/logo.png")).toBe(true);
    expect(isValidLogoStorageObjectKey("logo-abc.png")).toBe(true);
  });

  it("caches failed URLs temporarily", () => {
    const u = "https://example.test/storage/v1/object/public/paidly/x.png";
    expect(isStorageAssetKnownFailed(u)).toBe(false);
    markStorageAssetFailed(u);
    expect(isStorageAssetKnownFailed(u)).toBe(true);
    expect(isStorageAssetKnownFailed(`${u}?v=2`)).toBe(true);
  });
});
