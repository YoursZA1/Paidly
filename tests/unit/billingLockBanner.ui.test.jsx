/** @vitest-environment jsdom */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import BillingLockBanner from "@/components/subscription/BillingLockBanner";
import { MARKETING_PLANS } from "@shared/planMarketing.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderBanner(props = {}) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <BillingLockBanner {...props} />
      </MemoryRouter>
    );
  });
}

describe("BillingLockBanner", () => {
  it("shows the real catalog price for a known self-serve package — never a hardcoded amount", async () => {
    await renderBanner({ plan: "business", planLabel: "Business", statusLabel: "Payment failed" });
    expect(container.textContent).toContain(
      `Pay Business — R${MARKETING_PLANS.business.monthlyPriceZar}/mo`
    );
    expect(container.textContent).toContain("Your Business subscription has ended");
    // Reassuring tone: paused, not deleted.
    expect(container.textContent).toContain("Your data is still here to view.");
  });

  it("uses the trial wording when the lapsed package was a trial", async () => {
    await renderBanner({ plan: "starter", planLabel: "Starter", statusLabel: "Trial expired" });
    expect(container.textContent).toContain("Your Starter trial has ended");
    expect(container.textContent).toContain(`Pay Starter — R${MARKETING_PLANS.starter.monthlyPriceZar}/mo`);
  });

  it("falls back to a generic CTA when there is no known self-serve package", async () => {
    await renderBanner({ plan: null, planLabel: "", statusLabel: "" });
    expect(container.textContent).toContain("Your subscription has ended");
    expect(container.textContent).toContain("Choose a plan");
    expect(container.textContent).not.toMatch(/Pay .+ — R/);
  });

  it("never quotes a self-serve price for Enterprise (contact-sales, no fixed price)", async () => {
    await renderBanner({ plan: "enterprise", planLabel: "Enterprise", statusLabel: "Payment failed" });
    expect(container.textContent).toContain("Choose a plan");
    expect(container.textContent).not.toMatch(/Pay Enterprise — R/);
  });
});
