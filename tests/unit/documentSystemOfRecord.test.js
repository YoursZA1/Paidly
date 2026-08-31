import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_DOCUMENT_TABLES,
  GENERIC_DOCUMENT_TABLE,
  assertHubWritableType,
  hubWriteForbiddenMessage,
  leftoverHubCommercialMessage,
  isCommercialDocumentType,
  isDocumentsHubExcludedType,
  postgrestExcludeCommercialHubTypes,
  tableForDocumentType,
} from "@/document-engine/documentSystemOfRecord";
import { getConversionOptions, DOCUMENT_CONVERSIONS, specialisedComposeUrl, hubDocumentToComposePrefill } from "@/document-engine/documentConversions";
import { HUB_DOCUMENT_TYPE_DEFS, isHubPersistedType } from "@/document-engine/documentCatalog";
import { getSupabaseTableForEntityName } from "@/api/entity/entityShared";

describe("document system of record", () => {
  it("maps commercial types to specialised tables", () => {
    expect(COMMERCIAL_DOCUMENT_TABLES.invoice).toBe("invoices");
    expect(COMMERCIAL_DOCUMENT_TABLES.quote).toBe("quotes");
    expect(COMMERCIAL_DOCUMENT_TABLES.payslip).toBe("payslips");
    expect(COMMERCIAL_DOCUMENT_TABLES.recurring_invoice).toBe("recurring_invoices");
    expect(tableForDocumentType("invoice")).toBe("invoices");
    expect(tableForDocumentType("quotes")).toBe("quotes");
    expect(tableForDocumentType("Payroll")).toBe("payslips");
    expect(tableForDocumentType("RecurringInvoice")).toBe("recurring_invoices");
  });

  it("maps generic types to the Documents Hub", () => {
    expect(GENERIC_DOCUMENT_TABLE).toBe("documents");
    expect(tableForDocumentType("leave_request")).toBe("documents");
    expect(tableForDocumentType("expense_claim")).toBe("documents");
    expect(tableForDocumentType("contract")).toBe("documents");
    expect(isCommercialDocumentType("leave_request")).toBe(false);
  });

  it("forbids writing commercial types to the hub", () => {
    expect(isDocumentsHubExcludedType("invoice")).toBe(true);
    expect(isDocumentsHubExcludedType("quote")).toBe(true);
    expect(isDocumentsHubExcludedType("payslip")).toBe(true);
    expect(() => assertHubWritableType("invoice")).toThrow(/invoices/i);
    expect(() => assertHubWritableType("leave_request")).not.toThrow();
    expect(hubWriteForbiddenMessage("quote")).toMatch(/quotes/i);
  });

  it("excludes invoice, quote, and payslip from hub catalog persistence", () => {
    expect(isHubPersistedType("invoice")).toBe(false);
    expect(isHubPersistedType("quote")).toBe(false);
    expect(isHubPersistedType("payslip")).toBe(false);
    expect(isHubPersistedType("leave_request")).toBe(true);
    expect(isHubPersistedType("expense_claim")).toBe(true);
    expect(HUB_DOCUMENT_TYPE_DEFS.some((t) => t.key === "invoice")).toBe(false);
    expect(HUB_DOCUMENT_TYPE_DEFS.some((t) => t.key === "leave_request")).toBe(true);
  });

  it("does not persist commercial types through hub conversions", () => {
    const hubOnlyTargets = Object.values(DOCUMENT_CONVERSIONS)
      .flatMap((opts) => opts)
      .filter((o) => o.persistence !== "commercial")
      .map((o) => o.targetType);
    expect(hubOnlyTargets.every((t) => !isDocumentsHubExcludedType(t))).toBe(true);
    expect(getConversionOptions("proposal").some((o) => o.targetType === "contract")).toBe(true);
  });

  it("converts hub job cards and reports by opening specialised compose", () => {
    const job = getConversionOptions("job_card");
    expect(job.some((o) => o.targetType === "invoice" && o.persistence === "commercial")).toBe(true);
    expect(getConversionOptions("project_report").some((o) => o.persistence === "commercial")).toBe(true);
    const url = specialisedComposeUrl("invoice", "hub-doc-1");
    expect(url).toMatch(/CreateDocument\/invoice/i);
    expect(url).toContain("fromHubDocument=hub-doc-1");
    expect(specialisedComposeUrl("leave_request", "hub-doc-1")).toBeNull();
    const prefill = hubDocumentToComposePrefill({
      id: "hub-doc-1",
      type: "job_card",
      title: "Site visit",
      body: "Fix the gate",
      document_items: [],
    });
    expect(prefill.line_items[0].description).toMatch(/Site visit/);
    expect(prefill.notes).toMatch(/Converted from Job Card/);
  });

  it("builds a PostgREST exclusion list for hub queries", () => {
    expect(postgrestExcludeCommercialHubTypes()).toBe("(invoice,quote,payslip)");
  });

  it("maps EntityManager names to specialised tables, never documents", () => {
    expect(getSupabaseTableForEntityName("Invoice")).toBe("invoices");
    expect(getSupabaseTableForEntityName("Quote")).toBe("quotes");
    expect(getSupabaseTableForEntityName("Payslip")).toBe("payslips");
    expect(getSupabaseTableForEntityName("Payroll")).toBe("payslips");
    expect(getSupabaseTableForEntityName("RecurringInvoice")).toBe("recurring_invoices");
    expect(getSupabaseTableForEntityName("Document")).toBeNull();
  });

  it("explains leftover hub commercial rows instead of treating them as live invoices", () => {
    expect(leftoverHubCommercialMessage("invoice")).toMatch(/Invoices page/i);
    expect(leftoverHubCommercialMessage("quote")).toMatch(/Quotes page/i);
    expect(leftoverHubCommercialMessage("payslip")).toMatch(/Payslips page/i);
  });
});
