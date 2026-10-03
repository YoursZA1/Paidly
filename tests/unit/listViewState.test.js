import { describe, expect, it } from "vitest";
import { resolveListViewState } from "@/lib/listViewState.js";

describe("list view state", () => {
  it("zero records + successful request → empty", () => {
    expect(resolveListViewState({ loading: false, error: null, count: 0 })).toBe("empty");
  });

  it("records + successful request → ready", () => {
    expect(resolveListViewState({ loading: false, error: null, count: 3 })).toBe("ready");
  });

  it("request still running → loading", () => {
    expect(resolveListViewState({ loading: true, error: null, count: 0 })).toBe("loading");
  });

  it("request failure → error, even when nothing was returned", () => {
    expect(resolveListViewState({ loading: false, error: new Error("permission denied"), count: 0 })).toBe("error");
  });
});
