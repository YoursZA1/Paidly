/** @vitest-environment jsdom */
import React from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  INACTIVITY_PHASE,
  applyHiddenPause,
  useInactivitySessionTimeout,
} from "@/hooks/useInactivitySessionTimeout";
const { act } = React;

function HookHarness(props) {
  const state = useInactivitySessionTimeout(props);
  React.useEffect(() => {
    props.onState(state);
  }, [props, state]);
  return null;
}

const IDLE = 5_000;
const WARN = 2_000;

describe("useInactivitySessionTimeout", () => {
  let container;
  let root;
  let latest;

  const mount = async (overrides = {}) => {
    const props = {
      enabled: true,
      onWarningElapsed: vi.fn(async () => "continue"),
      onStayLoggedIn: vi.fn(async () => "continue"),
      onRemoteTimeout: vi.fn(async () => {}),
      onKeepAlive: vi.fn(async () => {}),
      idleTimeoutMs: IDLE,
      warningTimeoutMs: WARN,
      keepAliveIntervalMs: 60_000,
      onState: (s) => {
        latest = s;
      },
      ...overrides,
    };
    await act(async () => {
      root.render(<HookHarness {...props} />);
    });
    return props;
  };
  const advance = async (ms) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  const fire = async (target, type) => {
    await act(async () => {
      target.dispatchEvent(new Event(type));
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("TEST 1: stays quiet while the user is active", async () => {
    const props = await mount();
    for (let i = 0; i < 4; i += 1) {
      await advance(IDLE - 1_000);
      await fire(window, "keydown");
    }
    expect(latest.warningOpen).toBe(false);
    expect(props.onWarningElapsed).not.toHaveBeenCalled();
  });

  it("TEST 2: shows the warning after the idle threshold, and activity closes it", async () => {
    const props = await mount();
    await advance(IDLE);
    expect(latest.warningOpen).toBe(true);
    expect(latest.countdownSeconds).toBe(2);
    await fire(window, "mousemove");
    expect(latest.warningOpen).toBe(false);
    expect(props.onWarningElapsed).not.toHaveBeenCalled();
  });

  it("TEST 3: Stay Logged In runs a session refresh, then closes the warning and restarts the timer", async () => {
    const props = await mount();
    await advance(IDLE);
    await act(async () => {
      latest.stayLoggedIn();
    });
    expect(props.onStayLoggedIn).toHaveBeenCalledTimes(1);
    expect(latest.warningOpen).toBe(false);
    expect(latest.phase).toBe(INACTIVITY_PHASE.ACTIVE);
    await advance(IDLE);
    expect(latest.warningOpen).toBe(true);
  });

  it("TEST 4: at zero it checks the session instead of logging out, and the app keeps going", async () => {
    const props = await mount();
    await advance(IDLE + WARN + 100);
    expect(props.onWarningElapsed).toHaveBeenCalledTimes(1);
    expect(latest.warningOpen).toBe(false);
    expect(latest.phase).toBe(INACTIVITY_PHASE.ACTIVE);
  });

  it("ends only when the caller confirms the session is gone", async () => {
    const props = await mount({ onWarningElapsed: vi.fn(async () => "ended") });
    await advance(IDLE + WARN + 100);
    expect(props.onWarningElapsed).toHaveBeenCalledTimes(1);
    expect(latest.phase).toBe(INACTIVITY_PHASE.ENDED);
    expect(latest.warningOpen).toBe(false);
    await advance(IDLE * 3);
    expect(props.onWarningElapsed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("TEST 10: rapid Stay Logged In clicks start one refresh", async () => {
    let release;
    const onStayLoggedIn = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve("continue");
        })
    );
    await mount({ onStayLoggedIn });
    await advance(IDLE);
    await act(async () => {
      latest.stayLoggedIn();
      latest.stayLoggedIn();
      latest.stayLoggedIn();
    });
    expect(latest.refreshing).toBe(true);
    await act(async () => {
      latest.stayLoggedIn();
    });
    expect(onStayLoggedIn).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
    });
    expect(latest.warningOpen).toBe(false);
  });

  it("never times out in the middle of a refresh, even if the deadline passes", async () => {
    let release;
    const props = await mount({
      onStayLoggedIn: vi.fn(
        () =>
          new Promise((resolve) => {
            release = () => resolve("continue");
          })
      ),
    });
    await advance(IDLE);
    await act(async () => {
      latest.stayLoggedIn();
    });
    await advance(WARN * 5);
    expect(props.onWarningElapsed).not.toHaveBeenCalled();
    await fire(window, "mousemove");
    expect(latest.refreshing).toBe(true);
    await act(async () => {
      release();
    });
    expect(latest.phase).toBe(INACTIVITY_PHASE.ACTIVE);
  });

  it("fails open when the session check throws", async () => {
    await mount({ onWarningElapsed: vi.fn(async () => { throw new Error("boom"); }) });
    await advance(IDLE + WARN + 100);
    expect(latest.warningOpen).toBe(false);
    expect(latest.phase).toBe(INACTIVITY_PHASE.ACTIVE);
  });

  it("TEST 5: focus/visibility while warned never leaks a countdown that logs an active user out", async () => {
    const props = await mount();
    await advance(IDLE);
    expect(latest.warningOpen).toBe(true);
    // The old bug: each focus started another interval that nothing could clear.
    for (let i = 0; i < 5; i += 1) await fire(window, "focus");
    await fire(window, "keydown");
    expect(latest.warningOpen).toBe(false);
    await advance(IDLE - 500);
    expect(props.onWarningElapsed).not.toHaveBeenCalled();
    expect(latest.warningOpen).toBe(false);
  });

  it("TEST 6: time away from the tab pauses the idle clock and leaves no stale countdown", async () => {
    const props = await mount();
    await advance(IDLE);
    expect(latest.warningOpen).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await fire(document, "visibilitychange");
    await advance(60 * 60 * 1000);
    expect(props.onWarningElapsed).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await fire(document, "visibilitychange");
    await fire(window, "focus");
    expect(latest.warningOpen).toBe(true);
    expect(latest.countdownSeconds).toBe(2);
    await advance(WARN + 100);
    expect(props.onWarningElapsed).toHaveBeenCalledTimes(1);
  });

  it("TEST 8: mounting and unmounting repeatedly leaves no listeners or timers behind", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const docAdd = vi.spyOn(document, "addEventListener");
    const docRemove = vi.spyOn(document, "removeEventListener");
    for (let i = 0; i < 5; i += 1) {
      await mount();
      await advance(IDLE);
      await act(async () => {
        root.unmount();
      });
      root = createRoot(container);
    }
    const pending = (adds, removes) =>
      adds.mock.calls.filter(
        ([type, fn]) => !removes.mock.calls.some(([rType, rFn]) => rType === type && rFn === fn)
      );
    const tracked = new Set([
      "click", "keydown", "input", "mousemove", "mousedown", "pointerdown", "touchstart", "scroll",
      "focus", "visibilitychange", "paidly:critical-op-start", "paidly:critical-op-end",
    ]);
    const leaked = [...pending(addSpy, removeSpy), ...pending(docAdd, docRemove)].filter(([type]) => tracked.has(type));
    addSpy.mockRestore();
    removeSpy.mockRestore();
    docAdd.mockRestore();
    docRemove.mockRestore();
    expect(leaked.map(([type]) => type)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops everything when the session ends (enabled turns false)", async () => {
    await mount();
    await advance(IDLE);
    await mount({ enabled: false });
    expect(latest.warningOpen).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies hidden-tab pause math correctly", () => {
    expect(applyHiddenPause(1000, 2500)).toBe(3500);
    expect(applyHiddenPause(0, 2500)).toBe(0);
  });
});
