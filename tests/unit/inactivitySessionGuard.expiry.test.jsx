/** @vitest-environment jsdom */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logoutMock = vi.fn(async () => {});
const transitionToExpiredMock = vi.fn(async () => true);
let capturedOnTimeout = null;
let capturedOnRemoteTimeout = null;
const navGoMock = vi.fn();

vi.mock("@/lib/navigationService", () => ({
  navigateTo: (...args) => navGoMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    authReady: true,
    session: { accessToken: "tok" },
    logout: logoutMock,
  }),
}));

vi.mock("@/contexts/SessionManagerContext", () => ({
  useSessionManager: () => ({
    AuthStateMachine: {
      transitionToExpired: transitionToExpiredMock,
    },
  }),
}));

vi.mock("@/hooks/useInactivitySessionTimeout", () => ({
  useInactivitySessionTimeout: (opts) => {
    capturedOnTimeout = opts.onTimeout;
    capturedOnRemoteTimeout = opts.onRemoteTimeout;
    return {
      warningOpen: false,
      countdownSeconds: 0,
      stayLoggedIn: vi.fn(),
    };
  },
}));

import InactivitySessionGuard from "@/components/session/InactivitySessionGuard";

describe("InactivitySessionGuard terminal transitions", () => {
  let container;
  let root;

  beforeEach(async () => {
    navGoMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    logoutMock.mockClear();
    transitionToExpiredMock.mockClear();
    capturedOnTimeout = null;
    capturedOnRemoteTimeout = null;
    await act(async () => {
      root.render(<InactivitySessionGuard />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("onTimeout transitions EXPIRED before logout", async () => {
    expect(typeof capturedOnTimeout).toBe("function");
    await act(async () => {
      await capturedOnTimeout();
    });
    expect(transitionToExpiredMock).toHaveBeenCalledWith("inactivity_timeout", expect.any(Object));
    expect(logoutMock).toHaveBeenCalledWith({ keepExpiredState: true });
    expect(navGoMock).toHaveBeenCalledWith("/login?reason=inactivity");
  });

  it("onRemoteTimeout transitions EXPIRED", async () => {
    expect(typeof capturedOnRemoteTimeout).toBe("function");
    await act(async () => {
      await capturedOnRemoteTimeout();
    });
    expect(transitionToExpiredMock).toHaveBeenCalledWith("inactivity_timeout", expect.any(Object));
    expect(navGoMock).toHaveBeenCalledWith("/login?reason=inactivity");
  });
});
