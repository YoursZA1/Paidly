/** @vitest-environment jsdom */
/**
 * Customer-facing verification UX:
 *   - RequireAuth renders "Verify your email" (in place, no redirect loop) for an unverified session
 *     and never renders the protected page behind it
 *   - /auth/verified: Supabase verifies the token hash → "Email verified ✓" → welcome requested once;
 *     expired/used link → Paidly error state with resend
 *   - no customer-facing auth screen says "Supabase" or a generic "Success!"
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const { authState, service } = vi.hoisted(() => ({
  authState: { current: null },
  service: {
    verifyEmailTokenHash: vi.fn(),
    getVerifiedSession: vi.fn(async () => null),
    requestWelcomeEmail: vi.fn(async () => ({ sent: true })),
    resendSignupEmail: vi.fn(async () => true),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState.current }));
vi.mock("@/services/SupabaseAuthService", () => ({ default: service, AUTH_VERIFIED_PATH: "/auth/verified" }));

import RequireAuth from "@/components/auth/RequireAuth";
import AuthVerified from "@/pages/AuthVerified";
import { useSessionHealthStore, SESSION_STATUS } from "@/stores/sessionHealthStore";

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useSessionHealthStore.setState({ status: SESSION_STATUS.CONNECTED, reason: null, lastTransitionAt: Date.now() });
  Object.values(service).forEach((fn) => fn.mockClear?.());
  service.getVerifiedSession.mockResolvedValue(null);
  localStorage.clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(ui, url = "/") {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);
  });
  // let effects + promises settle
  for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
}

const text = () => container.textContent;
const button = (label) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(label));

describe("RequireAuth — unverified accounts get no application access", () => {
  const protectedApp = (
    <Routes>
      <Route path="/dashboard" element={<RequireAuth><div>BUSINESS DATA</div></RequireAuth>} />
    </Routes>
  );

  it("unverified session → 'Verify your email' screen; the protected page is not rendered", async () => {
    authState.current = {
      loading: false,
      user: { id: "u1", role: "user" },
      profileReady: true,
      session: { user: { id: "u1", email: "new@shop.co.za", email_confirmed_at: null } },
      logout: vi.fn(),
    };
    await render(protectedApp, "/dashboard");
    expect(text()).toContain("Verify your email");
    expect(text()).toContain("We've sent a verification link to:");
    expect(text()).toContain("new@shop.co.za");
    expect(text()).toContain("Please verify your email to activate your Paidly account.");
    expect(text()).not.toContain("BUSINESS DATA");
    expect(button("Resend verification email")).toBeTruthy();
    expect(button("Change email")).toBeTruthy();
  });

  it("resend works from the gate", async () => {
    authState.current = {
      loading: false,
      user: { id: "u1" },
      profileReady: true,
      session: { user: { id: "u1", email: "new@shop.co.za", email_confirmed_at: null } },
      logout: vi.fn(),
    };
    await render(protectedApp, "/dashboard");
    await act(async () => button("Resend verification email").click());
    expect(service.resendSignupEmail).toHaveBeenCalledWith("new@shop.co.za");
    expect(text()).toContain("A new verification link is on its way");
  });

  it("verified session → the app renders normally", async () => {
    authState.current = {
      loading: false,
      user: { id: "u2", role: "user" },
      profileReady: true,
      session: { user: { id: "u2", email: "owner@shop.co.za", email_confirmed_at: "2026-09-26T08:00:00Z" } },
    };
    await render(protectedApp, "/dashboard");
    expect(text()).toContain("BUSINESS DATA");
    expect(text()).not.toContain("Verify your email");
  });
});

describe("/auth/verified", () => {
  const page = (
    <Routes>
      <Route path="/auth/verified" element={<AuthVerified />} />
      <Route path="/auth/verified/pos-invite/:inviteToken" element={<AuthVerified />} />
      <Route path="/Dashboard" element={<div>DASHBOARD</div>} />
      <Route path="/pos/invite/:t" element={<div>POS INVITE</div>} />
    </Routes>
  );

  it("valid link → Supabase verifies the token → 'Email verified ✓' → welcome requested once → Go to Paidly", async () => {
    service.verifyEmailTokenHash.mockResolvedValue({ session: { access_token: "jwt-1" }, user: { id: "u1" } });
    await render(page, "/auth/verified?token_hash=abc123&type=email");
    expect(service.verifyEmailTokenHash).toHaveBeenCalledWith("abc123", "email");
    expect(text()).toContain("Email verified ✓");
    expect(text()).toContain("Your Paidly account is now active.");
    expect(service.requestWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(service.requestWelcomeEmail).toHaveBeenCalledWith("jwt-1");
    await act(async () => button("Go to Paidly").click());
    expect(text()).toContain("DASHBOARD");
  });

  it("POS invite link continues to the invited till", async () => {
    service.verifyEmailTokenHash.mockResolvedValue({ session: { access_token: "jwt-2" }, user: { id: "u2" } });
    await render(page, "/auth/verified/pos-invite/INV42?token_hash=zz&type=email");
    await act(async () => button("Go to Paidly").click());
    expect(text()).toContain("POS INVITE");
  });

  it("expired / already-used link → Paidly error state, resend available, no welcome email", async () => {
    service.verifyEmailTokenHash.mockRejectedValue(Object.assign(new Error("Email link is invalid or has expired"), { code: "otp_expired" }));
    await render(page, "/auth/verified?token_hash=old&type=email");
    expect(text()).toContain("This link has expired");
    expect(service.requestWelcomeEmail).not.toHaveBeenCalled();
    const input = container.querySelector("#verify-email");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "late@shop.co.za");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => container.querySelector("form").requestSubmit());
    expect(service.resendSignupEmail).toHaveBeenCalledWith("late@shop.co.za", null);
    expect(text()).toContain("a new link is on its way");
  });

  it("clicking the link again while already signed in as the verified user → still 'Email verified'", async () => {
    service.verifyEmailTokenHash.mockRejectedValue(new Error("Email link is invalid or has expired"));
    service.getVerifiedSession.mockResolvedValue({ access_token: "jwt-3" });
    await render(page, "/auth/verified?token_hash=used&type=email");
    expect(text()).toContain("Email verified ✓");
  });
});

describe("/auth/verified with a {{ .ConfirmationURL }} link (?code=)", () => {
  const page = (
    <Routes>
      <Route path="/auth/verified" element={<AuthVerified />} />
      <Route path="/" element={<div>HOME</div>} />
    </Routes>
  );
  const waitForText = async (needle, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !text().includes(needle)) {
      await act(async () => new Promise((r) => setTimeout(r, 100)));
    }
    return text().includes(needle);
  };

  it("same browser: the code becomes a session → 'Email verified ✓' → welcome requested", async () => {
    service.getVerifiedSession.mockResolvedValueOnce(null).mockResolvedValue({ access_token: "jwt-code" });
    await render(page, "/auth/verified?code=pkce-123");
    expect(await waitForText("Email verified ✓")).toBe(true);
    expect(text()).toContain("Your Paidly account is now active.");
    expect(button("Go to Paidly")).toBeTruthy();
    expect(service.requestWelcomeEmail).toHaveBeenCalledWith("jwt-code");
    expect(service.verifyEmailTokenHash).not.toHaveBeenCalled();
  });

  it("another device: no session, but the email IS verified → verified + sign in (never 'expired')", async () => {
    service.getVerifiedSession.mockResolvedValue(null);
    await render(page, "/auth/verified?code=pkce-456");
    expect(await waitForText("Email verified ✓")).toBe(true);
    expect(text()).toContain("Sign in to continue.");
    expect(text()).not.toContain("This link has expired");
    expect(service.requestWelcomeEmail).not.toHaveBeenCalled(); // sent on sign-in (fallback)
  }, 10_000);
});

describe("customer-facing wording", () => {
  it("auth screens never mention Supabase or say a generic 'Success!'", () => {
    const ROOT = path.resolve(__dirname, "../..");
    for (const f of ["src/pages/AuthVerified.jsx", "src/components/auth/VerifyEmailRequired.jsx", "src/pages/Signup.jsx", "src/components/auth/LandingLoginModal.jsx"]) {
      const jsxText = readFileSync(path.join(ROOT, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1")
        .replace(/import[^;]+;/g, "")
        // Code identifiers that merely contain the word (getSupabaseErrorMessage, SupabaseAuthService…).
        .replace(/\w*Supabase\w+|\w+Supabase\w*|@\/lib\/supabase\w*/g, "");
      expect(jsxText).not.toMatch(/>[^<]*Supabase[^<]*</);
      expect(jsxText).not.toMatch(/["'`][^"'`]*Supabase[^"'`]*["'`]/);
      expect(jsxText).not.toMatch(/>\s*Success!\s*</);
      expect(jsxText).not.toMatch(/Authentication successful/i);
    }
  });
});
