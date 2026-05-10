/** @vitest-environment jsdom */
import { describe, expect, it, afterEach } from "vitest";
import { buildLifecyclePlan } from "@/lib/connection/lifecyclePolicy";
import { LifecycleSignalType } from "@/lib/connection/lifecycleSignalTypes";

describe("buildLifecyclePlan", () => {
  const originalVisibility = typeof document !== "undefined" ? document.visibilityState : "visible";

  afterEach(() => {
    if (typeof document !== "undefined") {
      Object.defineProperty(document, "visibilityState", {
        value: originalVisibility,
        configurable: true,
      });
    }
  });

  it("REALTIME_SUBSCRIBED patches realtime, marks connected, hints recovery", () => {
    const { steps } = buildLifecyclePlan({ type: LifecycleSignalType.REALTIME_SUBSCRIBED });
    expect(steps.map((s) => s.kind)).toEqual(["patch", "mark_connected", "maybe_report_realtime_recovered"]);
    expect(steps[0]).toMatchObject({
      kind: "patch",
      data: { realtime: { phase: "subscribed", lastReason: "SUBSCRIBED" } },
    });
    expect(steps[1]).toEqual({ kind: "mark_connected", reason: "sync_realtime_ready" });
  });

  it("REALTIME_DISCONNECTED when not signed in only patches unstable", () => {
    const { steps } = buildLifecyclePlan({
      type: LifecycleSignalType.REALTIME_DISCONNECTED,
      status: "CLOSED",
      believedSignedIn: false,
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe("patch");
    expect(steps[0].data.realtime.phase).toBe("unstable");
  });

  it("REALTIME_DISCONNECTED when hidden uses background unstable without authority nudge", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const { steps } = buildLifecyclePlan({
      type: LifecycleSignalType.REALTIME_DISCONNECTED,
      status: "TIMED_OUT",
      believedSignedIn: true,
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].data.realtime.phase).toBe("unstable_background");
  });

  it("REALTIME_DISCONNECTED when visible and signed in escalates transport unstable", () => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    const { steps } = buildLifecyclePlan({
      type: LifecycleSignalType.REALTIME_DISCONNECTED,
      status: "CHANNEL_ERROR",
      believedSignedIn: true,
    });
    expect(steps.map((s) => s.kind)).toEqual(["patch", "report_realtime_unstable"]);
  });

  it("REFRESH_SKIPPED only patches refresh phase", () => {
    const { steps } = buildLifecyclePlan({
      type: LifecycleSignalType.REFRESH_SKIPPED,
      reason: "halted",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].data.refresh.phase).toBe("skipped");
    expect(steps[0].data.refresh.lastReason).toBe("halted");
  });

  it("REFRESH_RETRYING patches refresh phase without authority steps", () => {
    const { steps } = buildLifecyclePlan({
      type: LifecycleSignalType.REFRESH_RETRYING,
      reason: "joined_in_flight",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe("patch");
    expect(steps[0].data.refresh.phase).toBe("retrying");
    expect(steps[0].data.refresh.lastReason).toBe("joined_in_flight");
  });

  it("VISIBILITY_RESTORE_FAILED without session only patches visibility", () => {
    const { steps } = buildLifecyclePlan({
      type: LifecycleSignalType.VISIBILITY_RESTORE_FAILED,
      believedSignedIn: false,
      reason: "probe_failed",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe("patch");
  });

  it("VISIBILITY_RESTORE_FAILED when signed in requests visibility recover", () => {
    const { steps } = buildLifecyclePlan({
      type: LifecycleSignalType.VISIBILITY_RESTORE_FAILED,
      believedSignedIn: true,
      reason: "probe_failed",
    });
    expect(steps.map((s) => s.kind)).toEqual(["patch", "report_visibility_recover"]);
  });
});
