/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { __clearLogoUrlDiskCacheForTests } from "@/lib/logoUrlDiskCache";
import { __clearStorageAssetFailuresForTests } from "@/lib/paidlyStorageAssetGuard";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    storage: {
      from: (bucket) => ({
        getPublicUrl: (path) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` },
        }),
        createSignedUrl: async (path) => ({
          data: {
            signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t`,
          },
          error: null,
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

  it("signLogoUrl returns a signed object URL for a valid key", async () => {
    const { default: AssetService } = await import("@/services/AssetService");
    const signed = await AssetService.signLogoUrl("logo-abc.png");
    expect(signed).toContain("/object/sign/paidly/logo-abc.png");
  });

  it("resolves legacy profile-logos paths for read-only display", async () => {
    const { default: AssetService } = await import("@/services/AssetService");
    const signed = await AssetService.signLogoUrl("user-123/logo.png");
    expect(signed).toContain("/object/sign/profile-logos/user-123/logo.png");
  });
});
