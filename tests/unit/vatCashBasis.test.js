import { describe, expect, it } from "vitest";
import { VAT_MODE, allocateVatOnPayment, calculateNetFromGross } from "@shared/commercial/index.js";
import { TaxService } from "@/services/TaxService";

describe("calculateNetFromGross (SA 15%)", () => {
  it("extracts R150 VAT from R1,150 inclusive", () => {
    expect(calculateNetFromGross(1150, 15)).toEqual({
      net: 1000,
      exclusive: 1000,
      tax: 150,
      gross: 1150,
    });
  });
});

describe("allocateVatOnPayment", () => {
  it("uses stored tax/total on an exclusive invoice instead of assuming inclusive", () => {
    const exclusiveMixed = {
      vat_mode: VAT_MODE.EXCLUSIVE,
      tax_rate: 15,
      tax_amount: 15,
      total_amount: 215,
    };
    const allocated = allocateVatOnPayment(exclusiveMixed, 215);
    expect(allocated.method).toBe("stored_ratio");
    expect(allocated.tax).toBe(15);
    expect(allocated.net).toBe(200);
  });

  it("does not extract 15% from an exclusive mixed-rate total", () => {
    const naiveInclusive = calculateNetFromGross(215, 15);
    const allocated = allocateVatOnPayment(
      {
        vat_mode: VAT_MODE.EXCLUSIVE,
        tax_rate: 15,
        tax_amount: 15,
        total_amount: 215,
      },
      215
    );
    expect(allocated.tax).toBe(15);
    expect(naiveInclusive.tax).toBe(28.04);
    expect(allocated.tax).not.toBe(naiveInclusive.tax);
  });

  it("infers exclusive mixed-rate VAT from subtotal/total instead of extracting 15%", () => {
    const allocated = allocateVatOnPayment(
      {
        vat_mode: VAT_MODE.EXCLUSIVE,
        tax_rate: 15,
        subtotal: 200,
        total_amount: 215,
      },
      215
    );
    expect(allocated.method).toBe("inferred_from_totals");
    expect(allocated.tax).toBe(15);
    expect(allocated.net).toBe(200);
  });

  it("extracts VAT from a payment only when the invoice is explicitly inclusive and tax_amount is missing", () => {
    const allocated = allocateVatOnPayment(
      { vat_mode: VAT_MODE.INCLUSIVE, tax_rate: 15, total_amount: 1150 },
      1150
    );
    expect(allocated.method).toBe("inclusive_extract");
    expect(allocated.tax).toBe(150);
    expect(allocated.net).toBe(1000);
  });
});

describe("cash-basis VAT helper", () => {
  it("accounts exclusive invoice VAT from the stored tax ratio", () => {
    const result = TaxService.getVatLiabilityFromPaymentsCashBasis({
      invoices: [
        {
          id: "inv-ex",
          vat_mode: VAT_MODE.EXCLUSIVE,
          tax_rate: 15,
          tax_amount: 150,
          total_amount: 1150,
        },
      ],
      payments: [{ invoice_id: "inv-ex", amount: 1150, payment_date: "2026-09-01" }],
    });
    expect(result.vatDue).toBe(150);
    expect(result.netPayments).toBe(1000);
    expect(result.grossPayments).toBe(1150);
  });

  it("does not overstate VAT on an exclusive mixed-rate invoice", () => {
    const result = TaxService.getVatLiabilityFromPaymentsCashBasis({
      invoices: [
        {
          id: "inv-mix",
          vat_mode: VAT_MODE.EXCLUSIVE,
          tax_rate: 15,
          tax_amount: 15,
          total_amount: 215,
        },
      ],
      payments: [{ invoice_id: "inv-mix", amount: 215, payment_date: "2026-09-01" }],
    });
    expect(result.vatDue).toBe(15);
  });

  it("extracts VAT from an inclusive invoice payment", () => {
    const result = TaxService.getVatLiabilityFromPaymentsCashBasis({
      invoices: [
        {
          id: "inv-inc",
          vat_mode: VAT_MODE.INCLUSIVE,
          tax_rate: 15,
          tax_amount: 150,
          total_amount: 1150,
        },
      ],
      payments: [{ invoice_id: "inv-inc", amount: 575, payment_date: "2026-09-01" }],
    });
    expect(result.vatDue).toBe(75);
    expect(result.netPayments).toBe(500);
  });
});
