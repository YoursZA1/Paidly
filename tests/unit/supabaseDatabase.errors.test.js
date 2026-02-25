import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

describe("Supabase database error handling", () => {
  it("normalizes RLS/permission errors for display", () => {
    const rlsError = { message: "new row violates row-level security policy" };
    expect(getSupabaseErrorMessage(rlsError, "Access denied")).toBe(
      "new row violates row-level security policy"
    );
  });

  it("normalizes permission denied style messages", () => {
    expect(getSupabaseErrorMessage({ message: "Permission denied" }, "Failed")).toBe(
      "Permission denied"
    );
  });

  it("handles PostgrestError-like shape", () => {
    const err = { message: "Duplicate key", code: "23505", details: "Key (id) exists" };
    expect(getSupabaseErrorMessage(err, "Error")).toBe("Duplicate key");
  });

  it("expired session / JWT style is normalized", () => {
    const err = { message: "JWT expired" };
    expect(getSupabaseErrorMessage(err, "Session expired")).toBe("JWT expired");
  });
});
