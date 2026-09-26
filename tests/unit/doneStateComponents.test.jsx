/** @vitest-environment jsdom */
/**
 * Paidly Done Screen standard — rendered completion states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

const confetti = vi.fn();
vi.mock("@/utils/confetti", () => ({ runPaidConfetti: () => confetti() }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
const firstDocument = { level: "none" };
vi.mock("@/services/milestoneService", () => ({
  detectFirstDocument: async () => firstDocument.level,
  detectPaymentMilestone: async () => null,
}));
const returnStatus = { current: null };
vi.mock("@/api/documentPaymentApi", () => ({
  fetchPaymentReturnStatus: async () => returnStatus.current,
}));

const { default: DoneState } = await import("@/components/shared/DoneState");
const { DocumentSentDone } = await import("@/components/shared/DocumentSentDone");
const { default: DocumentCreatedDone } = await import("@/components/documents/DocumentCreatedDone");
const { default: PaymentReturnDone } = await import("@/components/invoice/PaymentReturnDone");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  confetti.mockClear();
  firstDocument.level = "none";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(ui) {
  await act(async () => {
    root.render(<MemoryRouter>{ui}</MemoryRouter>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const text = () => container.textContent.replace(/\s+/g, " ");
const buttons = () => [...container.querySelectorAll("button, a")].map((el) => el.textContent.trim()).filter(Boolean);

const in14Days = () => {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
};

describe("DoneState", () => {
  it("answers what happened, what next, what is pending and the next loop", async () => {
    const onClick = vi.fn();
    await render(
      <DoneState
        title="Invoice sent"
        reference={{ number: "Invoice INV-2026-0042", counterparty: "ABC Trading", amount: "R12,500.00", meta: "Due 12 October 2026" }}
        message="Sent successfully to accounts@abctrading.co.za."
        actions={[
          { label: "View invoice", onClick },
          { label: "Download PDF", onClick },
          { label: "Send reminder", onClick },
          { label: "A fourth action is dropped", onClick },
        ]}
        status={{ label: "Payment status", value: "Awaiting payment" }}
        followUp={{ label: "Track payment status", onClick }}
      />
    );
    const t = text();
    expect(t).toContain("Invoice sent");
    expect(t).toContain("INV-2026-0042 · ABC Trading");
    expect(t).toContain("R12,500.00");
    expect(t).toContain("Due 12 October 2026");
    expect(t).toContain("Payment status: Awaiting payment");
    expect(buttons()).toEqual(["View invoice", "Download PDF", "Send reminder", "Track payment status"]);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(confetti).not.toHaveBeenCalled();
  });

  it("celebrates with confetti only for strong or milestone moments", async () => {
    await render(<DoneState title="Invoice created" celebration="subtle" celebrationLabel="Your first invoice" />);
    expect(text()).toContain("Your first invoice");
    expect(confetti).not.toHaveBeenCalled();

    await render(<DoneState title="Payment recorded" celebration="milestone" celebrationLabel="R100 000 collected" />);
    expect(confetti).toHaveBeenCalledTimes(1);
  });
});

describe("DocumentSentDone", () => {
  it("invoice sent: shows the outstanding payment, due date and next actions — not just 'delivered'", async () => {
    await render(
      <DocumentSentDone
        docType="invoice"
        record={{ id: "inv-1", invoice_number: "INV-2026-0042", total_amount: 12500, currency: "ZAR", status: "sent", delivery_date: in14Days() }}
        client={{ name: "ABC Trading" }}
        recipient="accounts@abctrading.co.za"
        onDone={() => {}}
      />
    );
    const t = text();
    expect(t).toContain("Invoice sent");
    expect(t).toContain("Sent successfully to accounts@abctrading.co.za");
    expect(t).toContain("Payment status: Awaiting payment");
    expect(t).toContain("Payment is still outstanding");
    expect(t).toContain("Due in 14 days");
    expect(buttons()).toEqual(["View invoice", "Done"]);
  });

  it("quote sent: awaiting acceptance with the conversion as the open loop", async () => {
    await render(
      <DocumentSentDone docType="quote" record={{ id: "q-1", quote_number: "Q-7", total_amount: 900 }} recipient="a@b.co" onDone={() => {}} />
    );
    expect(text()).toContain("Quote status: Awaiting acceptance");
    expect(text()).toContain("Convert it to an invoice once the client accepts.");
  });
});

describe("DocumentCreatedDone", () => {
  it("says the draft has not been sent and leads with Send", async () => {
    const onSend = vi.fn();
    await render(
      <DocumentCreatedDone
        docType="invoice"
        record={{ id: "inv-1", invoice_number: "INV-9", total_amount: 500, status: "draft" }}
        client={{ name: "Acme" }}
        onSend={onSend}
        onDownload={() => {}}
        onEdit={() => {}}
      />
    );
    expect(text()).toContain("Invoice INV-9 created");
    expect(text()).toContain("Payment status: Not sent yet");
    expect(buttons().slice(0, 3)).toEqual(["Send invoice", "Download PDF", "Edit"]);
    await act(async () => container.querySelector("button").click());
    expect(onSend).toHaveBeenCalled();
  });

  it("marks the first invoice subtly (no confetti)", async () => {
    firstDocument.level = "subtle";
    await render(<DocumentCreatedDone docType="invoice" record={{ id: "inv-1", status: "draft" }} />);
    expect(text()).toContain("Your first invoice");
    expect(confetti).not.toHaveBeenCalled();
  });
});

describe("PaymentReturnDone", () => {
  it("customer: a confirmed intent shows payment received with a receipt action", async () => {
    returnStatus.current = {
      payment_intent: { status: "paid", amount: 2450, currency: "ZAR", provider_label: "Ozow" },
      snapshot: { amount_due: 0, invoice_number: "INV-1" },
    };
    await render(<PaymentReturnDone publicMode invoice={{ invoice_number: "INV-1" }} intentId="i-1" onDownload={() => {}} />);
    expect(text()).toContain("Payment received — thank you");
    expect(text()).toContain("Invoice status: Paid in full");
    expect(buttons()).toContain("Download receipt");
  });

  it("customer: a cancelled return says not completed and offers a retry", async () => {
    returnStatus.current = { payment_intent: { status: "requires_action", amount: 2450 }, snapshot: { amount_due: 2450 } };
    await render(
      <PaymentReturnDone publicMode invoice={{ invoice_number: "INV-1" }} intentId="i-1" resultParam="cancel" onRetry={() => {}} />
    );
    expect(text()).toContain("Payment not completed");
    expect(text()).toContain("You have not been charged");
    expect(buttons()).toContain("Try again");
  });

  it("an unconfirmed return never claims paid", async () => {
    returnStatus.current = { payment_intent: { status: "requires_action", amount: 2450 }, snapshot: { amount_due: 2450 } };
    await render(<PaymentReturnDone invoice={{}} intentId="i-1" />);
    expect(text()).toContain("Confirming your payment");
    expect(text()).not.toContain("Payment received");
  });
});
