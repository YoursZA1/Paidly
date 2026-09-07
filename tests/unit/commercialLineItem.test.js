import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_LINE_ITEM_COLUMNS,
  commercialLineItemToComposeRow,
  fromStoredCommercialLineItem,
  pickCommercialLineItemWriteColumns,
  toPersistableCommercialLineItem,
} from "../../shared/commercial/commercialLineItem.js";
import { csvRowToInvoicePayload, invoiceToCsvRow, INVOICE_CSV_HEADERS } from "../../src/utils/invoiceCsvMapping.js";
import { csvRowToQuotePayload, quoteToCsvRow, QUOTE_CSV_HEADERS } from "../../src/utils/quoteCsvMapping.js";

const RICH_LINE = {
  service_name: "Site labour",
  description: "On-site install",
  quantity: 2,
  unit_price: 150,
  sku: "LAB-42",
  item_type: "labor",
  tax_rate: 15,
  service_id: "11111111-1111-4111-8111-111111111111",
  catalog_item_id: "22222222-2222-4222-8222-222222222222",
  discount: 25,
  discount_type: "fixed",
  unit_type: "hour",
  industry_preset: "construction",
  industry: "automotive",
  preset: "retail",
  discount_amount: 99,
};

function expectRichFields(row) {
  expect(row.sku).toBe("LAB-42");
  expect(row.item_type).toBe("labor");
  expect(row.tax_rate).toBe(15);
  expect(row.service_id).toBe("11111111-1111-4111-8111-111111111111");
  expect(row.catalog_item_id).toBe("22222222-2222-4222-8222-222222222222");
  expect(row.discount).toBe(25);
  expect(row.discount_type).toBe("fixed");
  expect(row.unit_type).toBe("hour");
  expect(row.industry_preset).toBeUndefined();
  expect(row.industry).toBeUndefined();
  expect(row.preset).toBeUndefined();
}

describe("toPersistableCommercialLineItem", () => {
  it("round-trips the commercial line-item model and drops industry presets", () => {
    const persisted = toPersistableCommercialLineItem(RICH_LINE);
    expectRichFields(persisted);
    expect(persisted.description).toBe("On-site install");
    expect(persisted.quantity).toBe(2);
    expect(persisted.unit_price).toBe(150);
    expect(Object.keys(persisted).sort()).toEqual([...COMMERCIAL_LINE_ITEM_COLUMNS].sort());

    const reloaded = fromStoredCommercialLineItem(persisted);
    expectRichFields(reloaded);
    expect(reloaded.item_tax_rate).toBe(15);

    const compose = commercialLineItemToComposeRow(reloaded);
    expect(compose.sku).toBe("LAB-42");
    expect(compose.item_type).toBe("labor");
    expect(compose.tax_rate).toBe(15);
    expect(compose.service_id).toBe(RICH_LINE.service_id);
    expect(compose.catalog_item_id).toBe(RICH_LINE.catalog_item_id);
    expect(compose.discount).toBe(25);
    expect(compose.unit_type).toBe("hour");
    expectRichFields(toPersistableCommercialLineItem(compose));
  });

  it("does not treat catalog price-cut discount_amount as a line discount", () => {
    const persisted = toPersistableCommercialLineItem({
      service_name: "Widget",
      quantity: 1,
      unit_price: 100,
      discount_amount: 40,
    });
    expect(persisted.discount).toBeNull();
    expect(persisted.discount_type).toBeNull();
  });

  it("rejects industry preset names as item_type", () => {
    const persisted = toPersistableCommercialLineItem({
      service_name: "Job",
      quantity: 1,
      unit_price: 10,
      item_type: "automotive",
      industry_preset: "manufacturing",
    });
    expect(persisted.item_type).toBeNull();
    expect(persisted.industry_preset).toBeUndefined();
  });

  it("whitelists only persistable columns for EntityManager writes", () => {
    const persisted = toPersistableCommercialLineItem({
      ...RICH_LINE,
      has_discount: true,
      price_locked: true,
    });
    const write = pickCommercialLineItemWriteColumns({
      ...persisted,
      industry_preset: "professional_services",
      invoice_id: "should-not-copy-here",
    });
    expect(write.industry_preset).toBeUndefined();
    expect(write.invoice_id).toBeUndefined();
    expectRichFields(write);
  });
});

describe("CSV commercial line items", () => {
  it("keeps rich invoice item fields through export and import", () => {
    const csvRow = invoiceToCsvRow({
      invoice_number: "INV-1",
      items: [RICH_LINE],
    });
    const itemsIndex = INVOICE_CSV_HEADERS.indexOf("items");
    expect(String(csvRow[itemsIndex])).toContain("LAB-42");
    const { payload } = csvRowToInvoicePayload(INVOICE_CSV_HEADERS, csvRow);
    expect(payload.items).toHaveLength(1);
    expectRichFields(payload.items[0]);
  });

  it("keeps rich quote item fields through export and import", () => {
    const csvRow = quoteToCsvRow({
      quote_number: "QUO-1",
      items: [RICH_LINE],
    });
    const payload = csvRowToQuotePayload(QUOTE_CSV_HEADERS, csvRow);
    expectRichFields(payload.items[0]);
  });
});
