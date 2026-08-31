import { describe, it, expect } from "vitest";
import { remainingReturnQuantities } from "../../server/src/pos/posCheckoutMath.js";
import {
  allocateReturnLines,
  attachRefundStateToSales,
  paymentMethodForRefundRail,
  refundRailForSale,
  remainingLinesForTill,
  summarizeSaleRefunds,
  withSaleLineIds,
} from "../../server/src/pos/posReturnMath.js";

const original = {
  id: "sale-1",
  sale_kind: "sale",
  total_amount: 75,
  items: [
    { product_id: "p1", name: "Coffee", quantity: 3, unit_price: 25, line_total: 75 },
  ],
};

describe("posReturnMath", () => {
  it("stamps stable line_ids without rewriting prices", () => {
    const stamped = withSaleLineIds([{ product_id: "p1", quantity: 2, unit_price: 10 }]);
    expect(stamped[0].line_id).toBe("line-1-p1");
    expect(stamped[0].unit_price).toBe(10);
  });

  it("keeps original sale refund_status none until a return exists", () => {
    const summary = summarizeSaleRefunds(original, []);
    expect(summary.refund_status).toBe("none");
    expect(summary.refunded_amount).toBe(0);
    expect(summary.remaining.get("p1")).toBe(3);
  });

  it("marks partial then full from append-only return events", () => {
    const first = {
      sale_kind: "return",
      status: "completed",
      parent_event_id: "sale-1",
      total_amount: -25,
      items: [{ product_id: "p1", quantity: 1 }],
    };
    const partial = summarizeSaleRefunds(original, [first]);
    expect(partial.refund_status).toBe("partial");
    expect(partial.refunded_amount).toBe(25);
    expect(partial.remaining.get("p1")).toBe(2);

    const second = {
      sale_kind: "return",
      status: "completed",
      parent_event_id: "sale-1",
      total_amount: -50,
      items: [{ product_id: "p1", quantity: 2 }],
    };
    const full = summarizeSaleRefunds(original, [first, second]);
    expect(full.refund_status).toBe("full");
    expect(full.remaining.get("p1")).toBe(0);
  });

  it("ignores failed return events so a retry can restock remaining qty", () => {
    const failed = {
      sale_kind: "return",
      status: "failed",
      total_amount: -75,
      items: [{ product_id: "p1", quantity: 3 }],
    };
    const summary = summarizeSaleRefunds(original, [failed]);
    expect(summary.refund_status).toBe("none");
    expect(remainingReturnQuantities(original.items, []).get("p1")).toBe(3);
  });

  it("allocates requested qty against remaining and rejects over-return", () => {
    const prior = [{
      sale_kind: "return",
      status: "completed",
      items: [{ product_id: "p1", quantity: 1 }],
    }];
    const ok = allocateReturnLines(original.items, prior, [{ product_id: "p1", quantity: 2 }]);
    expect(ok.ok).toBe(true);
    expect(ok.lines[0].quantity).toBe(2);
    expect(ok.lines[0].unit_price).toBe(25);

    const over = allocateReturnLines(original.items, prior, [{ product_id: "p1", quantity: 3 }]);
    expect(over.ok).toBe(false);
    expect(over.code).toBe("RETURN_QTY");
  });

  it("defaults omitted items to every remaining unit", () => {
    const built = allocateReturnLines(original.items, [], null);
    expect(built.ok).toBe(true);
    expect(built.lines[0].quantity).toBe(3);
  });

  it("uses till_cash for cash and pending_provider for card/digital", () => {
    expect(refundRailForSale("cash")).toBe("till_cash");
    expect(refundRailForSale("card")).toBe("pending_provider");
    expect(refundRailForSale("digital")).toBe("pending_provider");
    expect(refundRailForSale("card", { refundAsCash: true })).toBe("till_cash");
    expect(paymentMethodForRefundRail("till_cash", "card")).toBe("cash");
    expect(paymentMethodForRefundRail("pending_provider", "digital")).toBe("digital");
  });

  it("exposes remaining till lines and hides fully returned sales", () => {
    const lines = remainingLinesForTill(original, []);
    expect(lines).toHaveLength(1);
    expect(lines[0].remaining).toBe(3);

    const listed = attachRefundStateToSales([
      original,
      {
        id: "ret-1",
        sale_kind: "return",
        status: "completed",
        parent_event_id: "sale-1",
        total_amount: -75,
        items: [{ product_id: "p1", quantity: 3 }],
      },
    ]);
    expect(listed[0].refund_status).toBe("full");
    expect(remainingLinesForTill(original, [listed[1]])).toHaveLength(0);
  });
});
