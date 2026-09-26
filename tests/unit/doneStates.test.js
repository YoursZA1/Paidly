/**
 * Paidly Done Screen standard — policy (shared/ux/doneStates.js) and static guards.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  CELEBRATION,
  COLLECTION_MILESTONES,
  DONE_EVENT,
  DONE_TIER,
  INVOICE_OUTCOME,
  PAYMENT_RETURN_OUTCOME,
  compactAmount,
  creationCelebration,
  daysUntil,
  doneTierFor,
  dueFollowUpLabel,
  invoiceOutcome,
  paymentMilestone,
  paymentReturnOutcome,
} from "../../shared/ux/doneStates.js";

const NOW = new Date("2026-09-28T10:00:00");

describe("importance tiers", () => {
  it("routes each event to toast, panel, or persistent", () => {
    expect(doneTierFor(DONE_EVENT.RECORD_SAVED)).toBe(DONE_TIER.TOAST);
    expect(doneTierFor(DONE_EVENT.REMINDER_SENT)).toBe(DONE_TIER.TOAST);
    expect(doneTierFor(DONE_EVENT.INVOICE_SENT)).toBe(DONE_TIER.PANEL);
    expect(doneTierFor(DONE_EVENT.QUOTE_ACCEPTED)).toBe(DONE_TIER.PANEL);
    expect(doneTierFor(DONE_EVENT.PAYMENT_RECEIVED)).toBe(DONE_TIER.PERSISTENT);
    expect(doneTierFor(DONE_EVENT.PAYROLL_COMPLETED)).toBe(DONE_TIER.PERSISTENT);
    expect(doneTierFor(DONE_EVENT.POS_SALE_COMPLETED)).toBe(DONE_TIER.PERSISTENT);
    expect(doneTierFor("something_unknown")).toBe(DONE_TIER.TOAST);
  });

  it("every declared event has a tier", () => {
    for (const event of Object.values(DONE_EVENT)) {
      expect(Object.values(DONE_TIER)).toContain(doneTierFor(event));
    }
  });
});

describe("celebrate only meaningful milestones", () => {
  it("first payment ever is a strong celebration", () => {
    expect(paymentMilestone({ paidCountBefore: 0, collectedBefore: 0, collectedAfter: 2450 })).toMatchObject({
      level: CELEBRATION.STRONG,
      kind: "first_payment",
    });
  });

  it("routine payments are not celebrated", () => {
    expect(paymentMilestone({ paidCountBefore: 7, collectedBefore: 20_000, collectedAfter: 22_450 })).toBeNull();
  });

  it("crossing R100k collected is a milestone; the largest crossed threshold wins", () => {
    expect(paymentMilestone({ paidCountBefore: 30, collectedBefore: 99_000, collectedAfter: 101_000 })).toMatchObject({
      level: CELEBRATION.MILESTONE,
      threshold: 100_000,
      key: "collected:100000",
    });
    expect(paymentMilestone({ paidCountBefore: 30, collectedBefore: 90_000, collectedAfter: 260_000 })?.threshold).toBe(250_000);
    expect(paymentMilestone({ paidCountBefore: 30, collectedBefore: 100_000, collectedAfter: 120_000 })).toBeNull();
    expect(COLLECTION_MILESTONES[0]).toBe(100_000);
  });

  it("first invoice/quote created is subtle; every other creation is not celebrated", () => {
    expect(creationCelebration(1)).toBe(CELEBRATION.SUBTLE);
    expect(creationCelebration(2)).toBe(CELEBRATION.NONE);
    expect(creationCelebration(null)).toBe(CELEBRATION.NONE);
  });
});

describe("next open loop — due dates", () => {
  it("labels days until due, today, tomorrow and overdue", () => {
    expect(daysUntil("2026-10-12", NOW)).toBe(14);
    expect(dueFollowUpLabel("2026-10-12", NOW)).toBe("Due in 14 days");
    expect(dueFollowUpLabel("2026-09-29", NOW)).toBe("Due tomorrow");
    expect(dueFollowUpLabel("2026-09-28", NOW)).toBe("Due today");
    expect(dueFollowUpLabel("2026-09-27", NOW)).toBe("Overdue by 1 day");
    expect(dueFollowUpLabel("2026-09-20", NOW)).toBe("Overdue by 8 days");
    expect(dueFollowUpLabel(null, NOW)).toBeNull();
    expect(dueFollowUpLabel("not a date", NOW)).toBeNull();
  });
});

describe("what is still pending — invoice outcome", () => {
  it("a sent invoice is awaiting payment with the due date as the next loop", () => {
    expect(invoiceOutcome({ status: "sent", total: 12_500, amountDue: 12_500, dueDate: "2026-10-12", now: NOW })).toEqual({
      outcome: INVOICE_OUTCOME.AWAITING_PAYMENT,
      statusLabel: "Awaiting payment",
      amountDue: 12_500,
      pending: true,
      followUp: "Due in 14 days",
    });
  });

  it("partial, paid, overdue and draft outcomes", () => {
    expect(invoiceOutcome({ status: "sent", total: 1000, amountDue: 400, now: NOW }).outcome).toBe(INVOICE_OUTCOME.PARTIALLY_PAID);
    const paid = invoiceOutcome({ status: "paid", total: 1000, amountDue: 0, dueDate: "2026-10-12", now: NOW });
    expect(paid).toMatchObject({ outcome: INVOICE_OUTCOME.PAID, pending: false, followUp: null, amountDue: 0 });
    expect(invoiceOutcome({ status: "sent", total: 1000, amountDue: 1000, dueDate: "2026-09-01", now: NOW }).outcome).toBe(
      INVOICE_OUTCOME.OVERDUE
    );
    expect(invoiceOutcome({ status: "draft", total: 1000, now: NOW }).statusLabel).toBe("Not sent yet");
  });
});

describe("returning from the payment provider", () => {
  it("only a confirmed intent is paid — a success redirect alone is 'confirming'", () => {
    expect(paymentReturnOutcome({ intentStatus: "paid" }).outcome).toBe(PAYMENT_RETURN_OUTCOME.PAID);
    expect(paymentReturnOutcome({ intentStatus: "requires_action" }).outcome).toBe(PAYMENT_RETURN_OUTCOME.CONFIRMING);
    expect(paymentReturnOutcome({ intentStatus: "processing" }).tone).toBe("pending");
  });

  it("failed, cancelled, expired or a cancel/error redirect is 'not completed' unless already paid", () => {
    for (const intentStatus of ["failed", "cancelled", "expired"]) {
      expect(paymentReturnOutcome({ intentStatus }).outcome).toBe(PAYMENT_RETURN_OUTCOME.NOT_COMPLETED);
    }
    expect(paymentReturnOutcome({ intentStatus: "requires_action", resultParam: "cancel" }).tone).toBe("failed");
    expect(paymentReturnOutcome({ intentStatus: "paid", resultParam: "error" }).outcome).toBe(PAYMENT_RETURN_OUTCOME.PAID);
  });
});

describe("compact amounts", () => {
  it("formats milestone amounts", () => {
    expect(compactAmount(100_000)).toBe("100k");
    expect(compactAmount(1_500_000)).toBe("1.5m");
    expect(compactAmount(950)).toBe("950");
  });
});

describe("static guards — no generic success patterns on money flows", () => {
  const SRC = path.resolve(__dirname, "../../src");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith("._")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|jsx|ts|tsx)$/.test(name)) files.push(full);
    }
  };
  walk(SRC);

  it("no browser alert() announces a successful send", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/alert\(\s*['"`][^'"`]*sent successfully/i);
    }
  });

  it("confetti only fires from the Done State (milestones), never directly on every payment", () => {
    const users = files.filter((file) => /runPaidConfetti/.test(readFileSync(file, "utf8")));
    const rel = users.map((file) => path.relative(SRC, file)).sort();
    expect(rel).toEqual(["components/shared/DoneState.jsx", "utils/confetti.js"]);
  });

  it("creating an invoice or quote does not bounce straight back to the list when an id exists", () => {
    const create = readFileSync(path.join(SRC, "pages/CreateDocument.jsx"), "utf8");
    expect(create).toMatch(/createdDoneUrl\(createViewDocumentUrl\("quote", createdQuote\.id\)\)/);
    expect(create).toMatch(/createdDoneUrl\(createViewDocumentUrl\("invoice", result\.id\)\)/);
  });
});
