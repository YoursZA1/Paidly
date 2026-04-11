import { describe, expect, it } from "vitest";
import {
  isAdminPlatformMessageClientError,
  isAdminPlatformMessagesSchemaMissingError,
  isMissingAdminPlatformMessagesRelation,
  ADMIN_PLATFORM_MESSAGE_MAX_CONTENT,
  ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT,
} from "../../server/src/adminPlatformUserMessages.js";

describe("isAdminPlatformMessageClientError", () => {
  it("returns true for validation-style errors", () => {
    expect(isAdminPlatformMessageClientError("Invalid recipient_id")).toBe(true);
    expect(isAdminPlatformMessageClientError("Invalid sender_id")).toBe(true);
    expect(isAdminPlatformMessageClientError("Recipient not found")).toBe(true);
    expect(isAdminPlatformMessageClientError("Sender profile not found")).toBe(true);
    expect(isAdminPlatformMessageClientError("content is required")).toBe(true);
    expect(isAdminPlatformMessageClientError("subject too long (max 300 characters)")).toBe(true);
    expect(isAdminPlatformMessageClientError("content too long (max 50000 characters)")).toBe(true);
  });

  it("returns false for infrastructure errors", () => {
    expect(isAdminPlatformMessageClientError("connection reset")).toBe(false);
    expect(isAdminPlatformMessageClientError("")).toBe(false);
  });
});

describe("admin platform message limits", () => {
  it("exports sensible caps", () => {
    expect(ADMIN_PLATFORM_MESSAGE_MAX_SUBJECT).toBe(300);
    expect(ADMIN_PLATFORM_MESSAGE_MAX_CONTENT).toBe(50_000);
  });
});

describe("isAdminPlatformMessagesSchemaMissingError", () => {
  it("detects install hint from insert path", () => {
    expect(
      isAdminPlatformMessagesSchemaMissingError(
        "Admin messages table is not installed — run Supabase migration"
      )
    ).toBe(true);
    expect(isAdminPlatformMessagesSchemaMissingError("random")).toBe(false);
  });
});

describe("isMissingAdminPlatformMessagesRelation", () => {
  it("detects Postgres undefined relation", () => {
    expect(isMissingAdminPlatformMessagesRelation({ code: "42P01", message: "x" })).toBe(true);
    expect(
      isMissingAdminPlatformMessagesRelation({
        message: 'relation "public.admin_platform_messages" does not exist',
      })
    ).toBe(true);
    expect(isMissingAdminPlatformMessagesRelation({ message: "permission denied" })).toBe(false);
  });
});
