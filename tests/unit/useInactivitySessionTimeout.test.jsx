/** @vitest-environment jsdom */
import React from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { applyHiddenPause, useInactivitySessionTimeout } from "@/hooks/useInactivitySessionTimeout";
const { act } = React;

function HookHarness(props) {
  const state = useInactivitySessionTimeout(props);
  React.useEffect(() => {
    props.onState(state);
  }, [props, state]);
  return null;
}

describe("useInactivitySessionTimeout", () => {
  let container;
  let root;
  let latest;

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

  it("opens warning after idle threshold and resets on activity", async () => {
    const onTimeout = vi.fn(async () => {});
    const onKeepAlive = vi.fn(async () => {});
    await act(async () => {
      root.render(
        <HookHarness
          enabled
          onTimeout={onTimeout}
          onKeepAlive={onKeepAlive}
          idleTimeoutMs={5_000}
          warningTimeoutMs={2_000}
          keepAliveIntervalMs={1_000}
          onState={(s) => {
            latest = s;
          }}
        />
      );
    });

    expect(latest.warningOpen).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(latest.warningOpen).toBe(true);

    await act(async () => {
      window.dispatchEvent(new Event("mousemove"));
    });
    expect(latest.warningOpen).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("times out after warning reaches zero", async () => {
    const onTimeout = vi.fn(async () => {});
    await act(async () => {
      root.render(
        <HookHarness
          enabled
          onTimeout={onTimeout}
          onKeepAlive={async () => {}}
          idleTimeoutMs={4_000}
          warningTimeoutMs={2_000}
          keepAliveIntervalMs={10_000}
          onState={(s) => {
            latest = s;
          }}
        />
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(6_100);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("applies hidden-tab pause math correctly", () => {
    expect(applyHiddenPause(1000, 2500)).toBe(3500);
    expect(applyHiddenPause(0, 2500)).toBe(0);
  });
});
