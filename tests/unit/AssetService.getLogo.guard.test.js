/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { __clearLogoUrlDiskCacheForTests } from "@/lib/logoUrlDiskCache";
import { __clearStorageAssetFailuresForTests } from "@/lib/paidlyStorageAssetGuard";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/paidly/${path}` },
        }),
      }),
    },
  },
}));

describe("AssetService.getLogo + storage guard", () => {
  afterEach(() => {
    __clearStorageAssetFailuresForTests();
    __clearLogoUrlDiskCacheForTests();
  });

  it("returns fallback for invalid object keys without building a URL", async () => {
    const { default: AssetService } = await import("@/services/AssetService");
    expect(AssetService.getLogo("../../../etc/passwd")).toBe(AssetService.FALLBACK_LOGO);
  });

  it("returns fallback when URL is in the failed-asset cache", async () => {
    const { markStorageAssetFailed } = await import("@/lib/paidlyStorageAssetGuard");
    const { default: AssetService } = await import("@/services/AssetService");
    const path = "user/logo.png";
    const first = AssetService.getLogo(path);
    expect(first).toContain("supabase.co");
    markStorageAssetFailed(first);
    const second = AssetService.getLogo(path);
    expect(second).toBe(AssetService.FALLBACK_LOGO);
  });
});
