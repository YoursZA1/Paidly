import { describe, expect, it } from "vitest";
import {
  closeSessionSnapshot,
  parseCloseSessionBody,
  parseOpenSessionBody,
  publicSessionView,
  summarizeSessionCash,
} from "../../server/src/pos/posRegisterSessionMath.js";

const sales = [
  { sale_kind: "sale", payment_method: "cash", status: "completed", total_amount: 100 },
  { sale_kind: "sale", payment_method: "card", status: "completed", total_amount: 50 },
  { sale_kind: "return", payment_method: "cash", status: "completed", total_amount: -20 },
  { sale_kind: "sale", payment_method: "cash", status: "pending", total_amount: 999 },
];

describe("POS register sessions", () => {
  it("counts only completed cash sales and refunds toward expected drawer cash", () => {
    const totals = summarizeSessionCash(sales, 80);
    expect(totals).toEqual({
      cash_sales: 100,
      cash_refunds: 20,
      expected_cash: 160,
    });
  });

  it("snapshots variance at close as counted minus expected", () => {
    const closed = closeSessionSnapshot({
      opening_balance: 80,
      sales,
      closing_cash: 155,
    });
    expect(closed.expected_cash).toBe(160);
    expect(closed.closing_cash).toBe(155);
    expect(closed.variance).toBe(-5);
  });

  it("prefills opening cash from the register float when omitted", () => {
    const parsed = parseOpenSessionBody({ register_id: "reg-1" }, 250);
    expect(parsed.ok).toBe(true);
    expect(parsed.opening_balance).toBe(250);
  });

  it("rejects a close without counted cash", () => {
    expect(parseCloseSessionBody({}).ok).toBe(false);
    expect(parseCloseSessionBody({ closing_cash: -1 }).ok).toBe(false);
    const parsed = parseCloseSessionBody({ closing_cash: 40 });
    expect(parsed).toMatchObject({ ok: true, closing_cash: 40 });
  });

  it("marks closed sessions immutable on the public view", () => {
    const view = publicSessionView({
      id: "s1",
      org_id: "o1",
      register_id: "r1",
      status: "closed",
      opening_balance: 80,
      cash_sales: 100,
      cash_refunds: 20,
      expected_cash: 160,
      closing_cash: 160,
      variance: 0,
    });
    expect(view.immutable).toBe(true);
    expect(view.variance).toBe(0);
    expect(publicSessionView({ ...view, status: "open", closing_cash: null, variance: null }, { cash_sales: 10 })
      .immutable).toBe(false);
  });
});
