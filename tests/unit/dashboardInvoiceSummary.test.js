import { describe, expect, it } from "vitest";
import {
  DASHBOARD_INVOICES_SUMMARY_SELECT,
  DASHBOARD_INVOICES_SUMMARY_SELECT_MINIMAL,
  dashboardInvoiceSummaryRowSchema,
  isPostgrestSelectOrSyntax400,
  mapDashboardInvoiceSummaryRow,
} from "@/schemas/dashboardInvoiceSummary";

describe("dashboardInvoiceSummary (PostgREST / invoices)", () => {
  it("never requests app-only created_date in the primary select string", () => {
    expect(DASHBOARD_INVOICES_SUMMARY_SELECT).not.toMatch(/created_date/i);
    expect(DASHBOARD_INVOICES_SUMMARY_SELECT_MINIMAL).not.toMatch(/created_date/i);
  });

  it("primary select lists only known invoice columns used by the dashboard", () => {
    const cols = DASHBOARD_INVOICES_SUMMARY_SELECT.split(",").map((c) => c.trim());
    expect(cols).toEqual([
      "id",
      "client_id",
      "invoice_number",
      "status",
      "total_amount",
      "currency",
      "created_at",
      "delivery_date",
      "user_id",
      "created_by",
    ]);
  });

  it("minimal select is a strict subset of tokens in the primary select (minus optional delivery_date)", () => {
    const primary = new Set(DASHBOARD_INVOICES_SUMMARY_SELECT.split(",").map((c) => c.trim()));
    for (const c of DASHBOARD_INVOICES_SUMMARY_SELECT_MINIMAL.split(",").map((s) => s.trim())) {
      expect(primary.has(c)).toBe(true);
    }
  });

  it("isPostgrestSelectOrSyntax400 detects PostgREST unknown-column style errors", () => {
    expect(isPostgrestSelectOrSyntax400({ status: 400, message: "column x does not exist" })).toBe(true);
    expect(isPostgrestSelectOrSyntax400({ code: "PGRST204", message: "Could not find" })).toBe(true);
    expect(isPostgrestSelectOrSyntax400({ status: 403, message: "permission denied" })).toBe(false);
    expect(isPostgrestSelectOrSyntax400(null)).toBe(false);
  });

  it("mapDashboardInvoiceSummaryRow adds created_date from created_at and passes zod when well-formed", () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      client_id: null,
      invoice_number: "INV-1",
      status: "draft",
      total_amount: 100,
      currency: "USD",
      created_at: "2026-01-15T12:00:00.000Z",
      delivery_date: null,
      user_id: null,
      created_by: null,
    };
    expect(dashboardInvoiceSummaryRowSchema.safeParse(row).success).toBe(true);
    const mapped = mapDashboardInvoiceSummaryRow(row);
    expect(mapped.created_date).toBe(row.created_at);
  });
});
