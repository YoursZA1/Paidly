import { describe, it, expect } from "vitest";
import {
  getSupabaseErrorMessage,
  SUPABASE_ABORT_USER_MESSAGE,
  throwIfSupabaseError,
  withSupabaseErrorHandling,
} from "@/utils/supabaseErrorUtils";

describe("getSupabaseErrorMessage", () => {
  it("returns fallback when error is null or undefined", () => {
    expect(getSupabaseErrorMessage(null)).toBe("Something went wrong");
    expect(getSupabaseErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
    expect(getSupabaseErrorMessage(undefined)).toBe("Something went wrong");
  });

  it("returns string when error is a string", () => {
    expect(getSupabaseErrorMessage("Invalid email")).toBe("Invalid email");
  });

  it("normalizes abort / cancel errors (including Chromium 'signal is aborted' text)", () => {
    expect(getSupabaseErrorMessage({ message: "signal is aborted without reason" })).toBe(
      SUPABASE_ABORT_USER_MESSAGE
    );
    expect(getSupabaseErrorMessage("signal is aborted without reason")).toBe(SUPABASE_ABORT_USER_MESSAGE);
    const dom = new DOMException("Aborted", "AbortError");
    expect(getSupabaseErrorMessage(dom)).toBe(SUPABASE_ABORT_USER_MESSAGE);
  });

  it("returns error.message for Error instances", () => {
    expect(getSupabaseErrorMessage(new Error("Auth failed"))).toBe("Auth failed");
  });

  it("returns error.message for Supabase-style objects", () => {
    expect(getSupabaseErrorMessage({ message: "Bucket not found" })).toBe("Bucket not found");
  });

  it("returns error.error_description when message is missing", () => {
    expect(getSupabaseErrorMessage({ error_description: "Invalid grant" })).toBe("Invalid grant");
  });

  it("returns fallback when message is empty string", () => {
    expect(getSupabaseErrorMessage({ message: "" }, "Fallback")).toBe("Fallback");
    expect(getSupabaseErrorMessage({ message: "  " }, "Fallback")).toBe("Fallback");
  });

  it("trims whitespace from message", () => {
    expect(getSupabaseErrorMessage({ message: "  trimmed  " })).toBe("trimmed");
  });
});

describe("throwIfSupabaseError", () => {
  it("does not throw when result has no error", () => {
    expect(() => throwIfSupabaseError({ data: [] })).not.toThrow();
    expect(() => throwIfSupabaseError({})).not.toThrow();
  });

  it("throws with normalized message when result has error", () => {
    expect(() => throwIfSupabaseError({ error: { message: "Permission denied" } })).toThrow(
      "Permission denied"
    );
    expect(() =>
      throwIfSupabaseError({ error: { message: "RLS policy violation" } }, "Load failed")
    ).toThrow("RLS policy violation");
  });

  it("throws abort-shaped Supabase errors as friendly copy", () => {
    expect(() =>
      throwIfSupabaseError({ error: { message: "signal is aborted without reason" } }, "Load failed")
    ).toThrow(SUPABASE_ABORT_USER_MESSAGE);
  });

  it("throws Error with cause set to original error", () => {
    const result = { error: { message: "Test", code: "PGRST301" } };
    try {
      throwIfSupabaseError(result, "Context");
    } catch (e) {
      expect(e.cause).toBe(result.error);
    }
  });
});

describe("withSupabaseErrorHandling", () => {
  it("returns result when fn resolves", async () => {
    const out = await withSupabaseErrorHandling(async () => 42);
    expect(out).toBe(42);
  });

  it("rethrows with normalized message when fn throws", async () => {
    await expect(
      withSupabaseErrorHandling(async () => {
        throw new Error("Network error");
      }, "Fallback")
    ).rejects.toThrow("Network error");

    await expect(
      withSupabaseErrorHandling(async () => {
        throw { message: "Postgrest error" };
      }, "Fallback")
    ).rejects.toThrow("Postgrest error");
  });

  it("maps thrown abort errors to friendly copy", async () => {
    await expect(
      withSupabaseErrorHandling(async () => {
        throw new DOMException("signal is aborted without reason", "AbortError");
      }, "Operation failed")
    ).rejects.toThrow(SUPABASE_ABORT_USER_MESSAGE);
  });

  it("uses fallback when thrown error has no message or only [object Object]", async () => {
    await expect(
      withSupabaseErrorHandling(async () => {
        throw {};
      }, "Operation failed")
    ).rejects.toThrow("Operation failed");
    await expect(
      withSupabaseErrorHandling(async () => {
        throw { toString: () => "[object Object]" };
      }, "Fallback")
    ).rejects.toThrow("Fallback");
  });
});
