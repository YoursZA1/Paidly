import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockFrom = vi.fn(() => ({
  upload: mockUpload,
  createSignedUrl: mockCreateSignedUrl,
  getPublicUrl: vi.fn(() => ({ data: { publicUrl: null } })),
}));

const mockSupabase = {
  storage: {
    listBuckets: vi.fn(),
    from: mockFrom,
  },
};

vi.mock("@/lib/supabaseClient", () => ({ supabase: mockSupabase }));

describe("SupabaseStorageService (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.storage.listBuckets.mockResolvedValue({
      data: [{ id: "profile-logos", name: "profile-logos" }],
      error: null,
    });
  });

  describe("error handling", () => {
    it("uploadProfileLogo throws with user-friendly message on bucket not found", async () => {
      mockUpload.mockResolvedValue({
        error: { message: "Bucket not found" },
        data: null,
      });

      const { default: SupabaseStorageService } = await import(
        "@/services/SupabaseStorageService"
      );
      const file = new File(["x"], "logo.png", { type: "image/png" });
      await expect(
        SupabaseStorageService.uploadProfileLogo(file, "user-123")
      ).rejects.toThrow(/Storage bucket|Create it|migration/);
    });

    it("uploadProfileLogo throws with message on permission error", async () => {
      mockUpload.mockResolvedValue({
        error: { message: "Permission denied" },
        data: null,
      });

      const { default: SupabaseStorageService } = await import(
        "@/services/SupabaseStorageService"
      );
      const file = new File(["x"], "logo.png", { type: "image/png" });
      await expect(
        SupabaseStorageService.uploadProfileLogo(file, "user-123")
      ).rejects.toThrow(/Permission denied|logo upload/i);
    });
  });
});
