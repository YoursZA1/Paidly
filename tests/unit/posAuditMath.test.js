import { describe, expect, it } from "vitest";
import {
  POS_AUDIT_EVENT,
  POS_AUDIT_LABELS,
  isPosAuditEventType,
  normalizePosAuditWrite,
  posAuditInventoryAndCompletion,
  publicPosAuditView,
} from "../../server/src/pos/posAuditMath.js";

describe("POS audit trail", () => {
  it("accepts the required lifecycle event types", () => {
    expect(isPosAuditEventType(POS_AUDIT_EVENT.SALE_CREATED)).toBe(true);
    expect(isPosAuditEventType(POS_AUDIT_EVENT.PAYMENT)).toBe(true);
    expect(isPosAuditEventType(POS_AUDIT_EVENT.COMPLETION)).toBe(true);
    expect(isPosAuditEventType(POS_AUDIT_EVENT.REFUND)).toBe(true);
    expect(isPosAuditEventType(POS_AUDIT_EVENT.CANCELLATION)).toBe(true);
    expect(isPosAuditEventType(POS_AUDIT_EVENT.INVENTORY_MOVEMENT)).toBe(true);
    expect(isPosAuditEventType("silent_edit")).toBe(false);
  });

  it("requires org_id and rejects unknown types", () => {
    expect(normalizePosAuditWrite({ event_type: "payment" }).ok).toBe(false);
    expect(
      normalizePosAuditWrite({
        org_id: "org-1",
        event_type: "rewrite_total",
      }).ok
    ).toBe(false);
  });

  it("normalizes a refund event against the original sale", () => {
    const parsed = normalizePosAuditWrite({
      org_id: "org-1",
      sale_event_id: "sale-1",
      event_type: POS_AUDIT_EVENT.REFUND,
      actor_type: "user",
      actor_id: "cashier-1",
      metadata: { return_id: "ret-1" },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toMatchObject({
      event_type: "refund",
      sale_event_id: "sale-1",
      metadata: { return_id: "ret-1" },
    });
  });

  it("allows cancellation without a sale row", () => {
    const parsed = normalizePosAuditWrite({
      org_id: "org-1",
      payment_intent_id: "intent-1",
      event_type: POS_AUDIT_EVENT.CANCELLATION,
      metadata: { reason: "PAYMENT_NOT_VERIFIED" },
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.data.sale_event_id).toBeNull();
    expect(parsed.data.payment_intent_id).toBe("intent-1");
  });

  it("skips inventory and completion rows when the movement already applied", () => {
    expect(
      posAuditInventoryAndCompletion({
        orgId: "org-1",
        saleId: "sale-1",
        skip: true,
      })
    ).toEqual([]);
  });

  it("records inventory then completion after stock moves", () => {
    const rows = posAuditInventoryAndCompletion({
      orgId: "org-1",
      saleId: "sale-1",
      direction: "out",
      applied: true,
    });
    expect(rows.map((row) => row.event_type)).toEqual(["inventory_movement", "completion"]);
  });

  it("exposes human labels for the till timeline", () => {
    const view = publicPosAuditView({
      id: "e1",
      event_type: POS_AUDIT_EVENT.COMPLETION,
      actor_type: "system",
      occurred_at: "2026-08-28T20:00:00.000Z",
    });
    expect(view.label).toBe(POS_AUDIT_LABELS.completion);
    expect(view.event_type).toBe("completion");
  });
});
