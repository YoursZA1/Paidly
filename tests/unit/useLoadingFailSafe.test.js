import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startLoadingFailSafe, DEFAULT_LOADING_FAILSAFE_MS } from "@/hooks/useLoadingFailSafe";

describe("startLoadingFailSafe", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls setLoading(false) after maxMs if not cleared", () => {
    const setLoading = vi.fn();
    startLoadingFailSafe(setLoading, DEFAULT_LOADING_FAILSAFE_MS);
    expect(setLoading).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEFAULT_LOADING_FAILSAFE_MS);
    expect(setLoading).toHaveBeenCalledWith(false);
  });

  it("does not fire after clearLoadingFailSafe", () => {
    const setLoading = vi.fn();
    const clear = startLoadingFailSafe(setLoading, DEFAULT_LOADING_FAILSAFE_MS);
    clear();
    vi.advanceTimersByTime(DEFAULT_LOADING_FAILSAFE_MS);
    expect(setLoading).not.toHaveBeenCalled();
  });
});
