/** @vitest-environment jsdom */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RequireAuth from "@/components/auth/RequireAuth";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";
import { patchAuthSession, useAuthSessionStore } from "@/stores/authSessionStore";

const refreshUser = vi.fn(async () => {});
const authState = {
  loading: false,
  user: null,
  session: { user: { id: "user_1" }, accessToken: "tok" },
  profileReady: false,
  refreshUser,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

describe("RequireAuth profile hydrating", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    authState.loading = false;
    authState.user = null;
    authState.profileReady = false;
    authState.session = { user: { id: "user_1" }, accessToken: "tok" };
    refreshUser.mockReset();
    refreshUser.mockImplementation(async () => {});
    useSessionHealthStore.setState({
      status: SESSION_STATUS.CONNECTED,
      reason: null,
      lastTransitionAt: Date.now(),
    });
    patchAuthSession({ user: null, session: authState.session, loading: false, profileReady: false });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("does not redirect a valid session to login when the profile is still restoring", async () => {
    vi.useFakeTimers();
    refreshUser.mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/Dashboard"]}>
          <Routes>
            <Route
              path="/Dashboard"
              element={
                <RequireAuth>
                  <div data-testid="protected">Protected</div>
                </RequireAuth>
              }
            />
            <Route path="/Home" element={<div data-testid="home">Home</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Restoring your profile");
    expect(container.querySelector('[data-testid="home"]')).toBeNull();
    expect(container.querySelector('[data-testid="protected"]')).toBeNull();
  });

  it("shows a retry control after bounded restore failures without signing the user out", async () => {
    vi.useFakeTimers();
    refreshUser.mockImplementation(async () => {
      patchAuthSession({ user: null });
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/Dashboard"]}>
          <Routes>
            <Route
              path="/Dashboard"
              element={
                <RequireAuth>
                  <div data-testid="protected">Protected</div>
                </RequireAuth>
              }
            />
            <Route path="/Home" element={<div data-testid="home">Home</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(container.textContent).toContain("Unable to restore your workspace right now");
    expect(container.textContent).toContain("Retry");
    expect(container.querySelector('[data-testid="home"]')).toBeNull();
    expect(useAuthSessionStore.getState().session?.user?.id).toBe("user_1");
  });

  it("does not paint the dashboard with a JWT-minimal user before profiles returns", async () => {
    authState.user = { id: "user_1", full_name: "jwt" };
    authState.profileReady = false;
    patchAuthSession({
      user: authState.user,
      session: authState.session,
      loading: false,
      profileReady: false,
    });
    refreshUser.mockResolvedValue(undefined);
    vi.useFakeTimers();

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/Dashboard"]}>
          <Routes>
            <Route
              path="/Dashboard"
              element={
                <RequireAuth>
                  <div data-testid="protected">Protected</div>
                </RequireAuth>
              }
            />
            <Route path="/Home" element={<div data-testid="home">Home</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.textContent).toContain("Restoring your profile");
    expect(container.querySelector('[data-testid="protected"]')).toBeNull();
  });

  it("paints protected content only after profileReady", async () => {
    authState.user = { id: "user_1", full_name: "Ada", profileReady: true };
    authState.profileReady = true;
    patchAuthSession({
      user: authState.user,
      session: authState.session,
      loading: false,
      profileReady: true,
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/Dashboard"]}>
          <Routes>
            <Route
              path="/Dashboard"
              element={
                <RequireAuth>
                  <div data-testid="protected">Protected</div>
                </RequireAuth>
              }
            />
            <Route path="/Home" element={<div data-testid="home">Home</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.querySelector('[data-testid="protected"]')).not.toBeNull();
  });
});
