/**
 * Visual QA: generate fixture invoice PDFs via @react-pdf and assert valid blobs.
 * Run: npx vitest run tests/unit/invoicePdfFixtures.test.js
 */
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { pdf } from "@react-pdf/renderer";

vi.mock("@/lib/logoUrl", () => ({
  getLogoUrl: () => "",
}));

vi.mock("@/lib/documentIssuerBrand", () => ({
  resolveIssuerBrand: ({ document, profile }) => ({
    name: document?.owner_company_name || profile?.company_name || "Acme Co",
    logo: "",
    address: document?.owner_company_address || "",
    email: document?.owner_email || "",
    phone: document?.owner_phone || "",
    website: "",
    vatNumber: document?.owner_vat_number || "",
    brandPrimary: document?.document_brand_primary || "#0f766e",
    brandSecondary: null,
    currency: "ZAR",
  }),
}));

import Invoice from "@/components/pdf/Invoice";
import { mapInvoicePdfData } from "@/components/pdf/mapInvoicePdfData";

async function blobToHeader(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  return String.fromCharCode(...buf.slice(0, 5));
}

function makeInvoice({ itemsCount = 4, status = "sent", sparse = false } = {}) {
  const items = Array.from({ length: itemsCount }, (_, i) => ({
    name: sparse
      ? `Item ${i + 1}`
      : `Professional service ${i + 1} — detailed engagement for delivery and reporting`,
    description: sparse ? "" : "Scope includes discovery, design, and implementation support.",
    quantity: 1 + (i % 2),
    unit_price: 450 + i * 25,
    total_price: (1 + (i % 2)) * (450 + i * 25),
  }));

  if (sparse) {
    return {
      invoice_number: "INV-SPARSE",
      status,
      invoice_date: "2026-09-16",
      subtotal: 900,
      tax_rate: 0,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: 900,
      currency: "ZAR",
      owner_company_name: "Sparse Co",
      items,
    };
  }

  return {
    invoice_number: "INV-1004",
    status,
    invoice_date: "2026-09-16",
    delivery_date: "2026-09-30",
    subtotal: 5000,
    tax_rate: 15,
    tax_amount: 750,
    discount_amount: 100,
    total_amount: 5650,
    amount_paid: status === "partially_paid" ? 1000 : 0,
    balance_due: status === "partially_paid" ? 4650 : null,
    currency: "ZAR",
    notes: "Thank you for your business.",
    terms_conditions: "Payment due within 15 days of invoice date.",
    owner_company_name: "Acme Studios (Pty) Ltd",
    owner_company_address: "12 Long Street, Cape Town, 8001",
    owner_email: "accounts@acme.test",
    owner_phone: "+27 21 000 0000",
    owner_vat_number: "4123456789",
    document_brand_primary: "#0f766e",
    items,
  };
}

const client = {
  name: "Northwind Trading",
  email: "ap@northwind.test",
  address: "88 Market Street, Johannesburg",
  phone: "011 555 0100",
  vat_number: "4987654321",
};

const banking = {
  bank_name: "Standard Bank",
  account_name: "Acme Studios",
  account_number: "123456789",
  branch_code: "051001",
};

describe("premium invoice PDF fixtures", () => {
  it.each([
    ["normal", { itemsCount: 4, status: "sent" }],
    ["long", { itemsCount: 28, status: "sent" }],
    ["sparse", { itemsCount: 2, status: "draft", sparse: true }],
    ["paid", { itemsCount: 3, status: "paid" }],
    ["overdue", { itemsCount: 3, status: "overdue" }],
    ["partial", { itemsCount: 3, status: "partially_paid" }],
  ])("renders valid PDF for %s invoice", async (_label, opts) => {
    const invoice = makeInvoice(opts);
    const data = mapInvoicePdfData(
      invoice,
      opts.sparse ? { name: "Client" } : client,
      { company_name: "Acme", currency: "ZAR", document_brand_primary: "#0f766e" },
      opts.sparse ? null : banking
    );
    const blob = await pdf(React.createElement(Invoice, { data, currency: data.currency })).toBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
    expect(await blobToHeader(blob)).toBe("%PDF-");
  }, 30000);
});
