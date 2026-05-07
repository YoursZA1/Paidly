/** @vitest-environment jsdom */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import RequireAuth from "@/components/auth/RequireAuth";
import { SESSION_STATUS, useSessionHealthStore } from "@/stores/sessionHealthStore";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "user_1", role: "admin" },
    session: { user: { id: "user_1" } },
  }),
}));

function HomeProbe() {
  const location = useLocation();
  const fromPath = location?.state?.from?.pathname || "";
  return (
    <div>
      <div data-testid="home">Home login landing</div>
      <div data-testid="from-path">{fromPath}</div>
    </div>
  );
}

describe("RequireAuth EXPIRED redirect", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useSessionHealthStore.setState({
      status: SESSION_STATUS.CONNECTED,
      reason: null,
      lastTransitionAt: Date.now(),
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    useSessionHealthStore.setState({
      status: SESSION_STATUS.CONNECTED,
      reason: null,
      lastTransitionAt: Date.now(),
    });
  });

  it("unmounts protected route and redirects to login/home when EXPIRED", async () => {
    useSessionHealthStore.setState({
      status: SESSION_STATUS.EXPIRED,
      reason: "inactivity_timeout",
      lastTransitionAt: Date.now(),
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/Dashboard"]}>
          <Routes>
            <Route
              path="/Dashboard"
              element={
                <RequireAuth>
                  <div data-testid="protected">Protected route content</div>
                </RequireAuth>
              }
            />
            <Route path="/Home" element={<HomeProbe />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(container.querySelector('[data-testid="protected"]')).toBeNull();
    expect(container.querySelector('[data-testid="home"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="from-path"]')?.textContent).toBe("/Dashboard");
  });
});
