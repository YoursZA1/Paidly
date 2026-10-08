import { describe, expect, it } from "vitest";
import { buildVatReport, expenseInputVat } from "@/utils/vatReport";

const october = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T00:00:00") };

describe("buildVatReport", () => {
  it("counts VAT in a settled payment and ignores a pending one", () => {
    const report = buildVatReport({
      ...october,
      invoices: [{ id: "inv-1", invoice_number: "INV-1002", client_name: "ABC Trading", status: "sent", total_amount: 1150, tax_amount: 150, tax_rate: 15 }],
      payments: [
        { id: "p1", invoice_id: "inv-1", amount: 575, status: "completed", paid_at: "2026-10-08" },
        { id: "p2", invoice_id: "inv-1", amount: 575, status: "pending", paid_at: "2026-10-09" },
      ],
    });
    expect(report.outputVat).toBe(75);
    expect(report.standardRated).toBe(500);
    expect(report.vatDue).toBe(75);
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0].description).toBe("ABC Trading");
  });

  it("uses stored VAT on a paid invoice that has no payment row", () => {
    const report = buildVatReport({
      ...october,
      invoices: [{ id: "inv-2", invoice_number: "INV-9", status: "paid", total_amount: 1150, tax_amount: 150, invoice_date: "2026-10-04" }],
    });
    expect(report.outputVat).toBe(150);
    expect(report.standardRated).toBe(1000);
  });

  it("keeps till VAT on the POS sale and does not also tax the POS invoice copy", () => {
    const report = buildVatReport({
      ...october,
      invoices: [{ id: "inv-pos", status: "paid", total_amount: 115, tax_amount: 15, pos_sale_event_id: "sale-1", invoice_date: "2026-10-02" }],
      payments: [{ id: "p-pos", invoice_id: "inv-pos", amount: 115, status: "completed", paid_at: "2026-10-02" }],
      posSales: [{ id: "sale-1", status: "completed", sale_kind: "sale", total_amount: 115, occurred_at: "2026-10-02", raw_payload: { tax_amount: 15, subtotal: 100 } }],
    });
    expect(report.outputVat).toBe(15);
    expect(report.lines.map((row) => row.source)).toEqual(["POS"]);
  });

  it("subtracts expense VAT from output VAT", () => {
    const report = buildVatReport({
      ...october,
      invoices: [{ id: "inv-1", status: "paid", total_amount: 1150, tax_amount: 150, invoice_date: "2026-10-04" }],
      expenses: [
        { id: "e1", amount: 115, vat: 15, date: "2026-10-08", description: "Paper" },
        { id: "e2", amount: 50, vat: 0, subtotal: 100, vat_rate: 15, date: "2026-10-09" },
        { id: "e3", amount: 200, vat: 30, date: "2026-09-01" },
      ],
    });
    expect(expenseInputVat({ amount: 115, vat: 15 })).toBe(15);
    expect(report.inputVat).toBe(30);
    expect(report.vatDue).toBe(120);
  });

  it("lists a zero-rated receipt separately from standard-rated sales", () => {
    const report = buildVatReport({
      ...october,
      invoices: [{ id: "inv-z", status: "paid", total_amount: 400, tax_amount: 0, tax_rate: 0, invoice_date: "2026-10-03" }],
    });
    expect(report.outputVat).toBe(0);
    expect(report.zeroRated).toBe(400);
    expect(report.standardRated).toBe(0);
  });
});
