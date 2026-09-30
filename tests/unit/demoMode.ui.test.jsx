/** @vitest-environment jsdom */
/**
 * Demo Mode UI: banner, restricted sections, simulated payments, /demo landing, and the client send
 * short-circuit. The demo state hook and API calls are faked at module boundaries.
 */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const demoState = vi.hoisted(() => ({
  value: { isDemo: true, loading: false, businessName: "Mavela Café", expiresAt: null, expired: false, minutesLeft: 95, orgId: "org-demo" },
}));
const auth = vi.hoisted(() => ({ user: { id: "demo-user" }, session: { user: { id: "demo-user" } }, logout: vi.fn(async () => {}) }));
const api = vi.hoisted(() => ({
  startLiveDemo: vi.fn(async () => ({ businessName: "Mavela Café", expiresAt: null })),
  resetLiveDemo: vi.fn(async () => ({ expiresAt: null })),
  endLiveDemo: vi.fn(async () => {}),
  purgeLocalAppCaches: vi.fn(async () => {}),
}));
const docPay = vi.hoisted(() => ({ startDocumentPayment: vi.fn() }));

vi.mock("@/hooks/useDemoMode", () => ({
  useDemoMode: () => demoState.value,
  formatDemoTimeLeft: (m) => (m == null ? null : `${Math.floor(m / 60)} h ${m % 60} min`),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/lib/demo/demoModeApi", () => ({ ...api, demoErrorMessage: (c, f) => f }));
vi.mock("@/api/documentPaymentApi", () => docPay);
vi.mock("@/components/Navbar", () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/auth/LandingLoginModal", () => ({ default: () => null }));

const { default: DemoModeBanner } = await import("@/components/demo/DemoModeBanner");
const { DemoRestrictedPanel, default: DemoRestricted } = await import("@/components/demo/DemoRestricted");
const { default: DemoPaymentPanel } = await import("@/components/demo/DemoPaymentPanel");
const { default: DemoInvoicePaymentDialog } = await import("@/components/demo/DemoInvoicePaymentDialog");
const { default: DemoLanding } = await import("@/pages/DemoLanding");
const state = await import("@/lib/demo/demoModeState");

let container;
let root;
let assign;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  assign = vi.fn();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign, pathname: "/Dashboard", search: "" } });
  demoState.value = { ...demoState.value, isDemo: true, expired: false, minutesLeft: 95 };
  Object.values(api).forEach((fn) => fn.mockClear());
  auth.logout.mockClear();
  window.sessionStorage.clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const render = (ui, path = "/Dashboard") =>
  act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
  });
const click = (el) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
const buttonByText = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(text));
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("DemoModeBanner", () => {
  it("renders nothing outside Demo Mode", async () => {
    demoState.value = { ...demoState.value, isDemo: false };
    await render(<DemoModeBanner />);
    expect(byTestId("demo-mode-banner")).toBeNull();
  });

  it("always identifies the demo and offers Reset, End and account creation", async () => {
    await render(<DemoModeBanner variant="till" />);
    const banner = byTestId("demo-mode-banner");
    expect(banner.textContent).toMatch(/Demo mode/i);
    expect(banner.textContent).toContain("Mavela Café");
    expect(banner.textContent).toContain("1 h 35 min left");
    expect(byTestId("demo-reset-button")).not.toBeNull();
    expect(byTestId("demo-create-account")).not.toBeNull();
  });

  it("Reset demo confirms, resets on the server and ends in a Done State", async () => {
    await render(<DemoModeBanner variant="till" />);
    await click(byTestId("demo-reset-button"));
    expect(byTestId("demo-reset-dialog").textContent).toContain("Reset the demo?");
    await click(byTestId("demo-reset-confirm"));
    await flush();
    expect(api.resetLiveDemo).toHaveBeenCalledTimes(1);
    expect(byTestId("demo-reset-dialog").textContent).toContain("Demo reset");
    expect(byTestId("demo-reset-dialog").textContent).toContain("Go to dashboard");
  });

  it("Create your Paidly account ends the demo, signs out and opens signup", async () => {
    await render(<DemoModeBanner variant="till" />);
    await click(byTestId("demo-create-account"));
    await flush();
    expect(api.endLiveDemo).toHaveBeenCalledTimes(1);
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/signup?from=demo");
  });

  it("shows an explicit ended state when the demo has expired", async () => {
    demoState.value = { ...demoState.value, expired: true, minutesLeft: 0 };
    await render(<DemoModeBanner variant="till" />);
    expect(byTestId("demo-mode-banner").textContent).toContain("This demo has ended");
    expect(buttonByText("Start a fresh demo")).toBeTruthy();
  });

  it("welcomes the visitor once per session with quick links", async () => {
    await render(<DemoModeBanner />);
    expect(byTestId("demo-welcome").textContent).toContain("Welcome to Mavela Café");
    expect(byTestId("demo-welcome").textContent).toContain("You're exploring Paidly in Demo Mode.");
    for (const label of ["Dashboard", "POS & tables", "Invoices", "Customers", "Reports"]) {
      expect(byTestId("demo-welcome").textContent).toContain(label);
    }
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(<DemoModeBanner />);
    expect(byTestId("demo-welcome")).toBeNull();
  });
});

describe("restricted features", () => {
  it("replaces a restricted page with a professional explanation in Demo Mode", async () => {
    await render(
      <DemoRestricted feature="Billing">
        <p data-testid="real-billing">billing page</p>
      </DemoRestricted>
    );
    expect(byTestId("real-billing")).toBeNull();
    expect(byTestId("demo-restricted").textContent).toContain("Billing needs a real Paidly account");
  });

  it("renders the real page outside Demo Mode", async () => {
    demoState.value = { ...demoState.value, isDemo: false };
    await render(
      <DemoRestricted feature="Billing">
        <p data-testid="real-billing">billing page</p>
      </DemoRestricted>
    );
    expect(byTestId("real-billing")).not.toBeNull();
  });

  it("panel copy can be specific to the section", async () => {
    await render(<DemoRestrictedPanel feature="Team and user management" description="Invites would reach real inboxes." />);
    expect(byTestId("demo-restricted").textContent).toContain("Invites would reach real inboxes.");
  });
});

describe("simulated payments", () => {
  it("offers SUCCESS / FAILED / PENDING, labelled as simulated", async () => {
    const onOutcome = vi.fn(async () => {});
    await render(<DemoPaymentPanel amount={144} currency="ZAR" onOutcome={onOutcome} />);
    const panel = byTestId("demo-payment-panel");
    expect(panel.textContent).toMatch(/no money moves/i);
    expect(panel.textContent).toContain("Demo Payment Successful");
    expect(panel.textContent).toContain("Demo Payment Failed");
    expect(panel.textContent).toContain("Demo Payment Pending");
    await click(byTestId("demo-outcome-failed"));
    expect(onOutcome).toHaveBeenCalledWith("failed");
  });

  it("invoice Pay now: a successful simulated payment is applied by the server and ends in a Done State", async () => {
    docPay.startDocumentPayment.mockResolvedValue({ ok: true, demo: true, recorded: true, invoice_status: "paid", amount_due: 0 });
    const onSettled = vi.fn();
    await render(
      <DemoInvoicePaymentDialog
        open
        onOpenChange={() => {}}
        demo={{ invoiceId: "inv-1", invoiceNumber: "INV-1017", amount: 5980, currency: "ZAR" }}
        onSettled={onSettled}
      />
    );
    await click(byTestId("demo-outcome-succeeded"));
    await flush();
    expect(docPay.startDocumentPayment).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "inv-1", demoOutcome: "succeeded", idempotencyKey: expect.any(String) })
    );
    expect(onSettled).toHaveBeenCalled();
    expect(byTestId("demo-invoice-payment").textContent).toContain("Demo Payment Successful");
    expect(byTestId("demo-invoice-payment").textContent).toContain("Simulated · no money moved");
  });
});

describe("/demo landing", () => {
  it("explains the demo and offers Enter Live Demo + Create Your Paidly Account", async () => {
    auth.user = null;
    auth.session = null;
    demoState.value = { ...demoState.value, isDemo: false };
    await render(<DemoLanding />, "/demo");
    expect(document.body.textContent).toContain("Experience Paidly with a live demo business.");
    expect(document.body.textContent).toContain("Create Your Paidly Account");
    expect(document.body.textContent).toMatch(/Payments are simulated/);
    await click(byTestId("enter-live-demo"));
    await flush();
    expect(api.startLiveDemo).toHaveBeenCalledTimes(1);
    expect(auth.logout).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/Dashboard");
  });

  it("signs a real account out before entering the demo", async () => {
    auth.user = { id: "real-user" };
    auth.session = { user: { id: "real-user" } };
    demoState.value = { ...demoState.value, isDemo: false };
    await render(<DemoLanding />, "/demo/some-business-id");
    expect(byTestId("enter-live-demo").textContent).toContain("Sign out & enter live demo");
    await click(byTestId("enter-live-demo"));
    await flush();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(api.startLiveDemo).toHaveBeenCalledTimes(1);
    auth.user = { id: "demo-user" };
    auth.session = { user: { id: "demo-user" } };
  });

  it("shows a friendly error when the demo cannot start", async () => {
    auth.user = null;
    auth.session = null;
    demoState.value = { ...demoState.value, isDemo: false };
    api.startLiveDemo.mockRejectedValueOnce(new Error("The live demo is very busy right now. Please try again in a few minutes."));
    await render(<DemoLanding />, "/demo");
    await click(byTestId("enter-live-demo"));
    await flush();
    expect(document.querySelector('[role="alert"]').textContent).toContain("very busy");
    expect(assign).not.toHaveBeenCalled();
    auth.user = { id: "demo-user" };
    auth.session = { user: { id: "demo-user" } };
  });
});

describe("routing", () => {
  it("/demo (and /demo/<anything>) is reachable without a session; app pages are not", async () => {
    const { isPathAllowedWithoutSession } = await import("@/utils/sessionGuard");
    expect(isPathAllowedWithoutSession("/demo")).toBe(true);
    expect(isPathAllowedWithoutSession("/demo/3f2a-some-business-id")).toBe(true);
    expect(isPathAllowedWithoutSession("/demos-internal")).toBe(false);
    expect(isPathAllowedWithoutSession("/Dashboard")).toBe(false);
  });
});

describe("client demo state", () => {
  it("reads the server-set claim only from app_metadata (user_metadata is user-editable)", () => {
    expect(state.sessionUserIsDemo({ app_metadata: { paidly_demo: true } })).toBe(true);
    expect(state.sessionUserIsDemo({ user_metadata: { paidly_demo: true } })).toBe(false);
    expect(state.sessionUserIsDemo(null)).toBe(false);
  });

  it("recognises server demo responses", () => {
    expect(state.isDemoNotSentResponse({ demo: true, sent: false })).toBe(true);
    expect(state.isDemoNotSentResponse({ success: true })).toBe(false);
    expect(state.isDemoRestrictedResponse({ code: "DEMO_MODE_RESTRICTED" })).toBe(true);
  });
});
