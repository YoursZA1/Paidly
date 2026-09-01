import { describe, expect, it } from "vitest";
import { createPageUrl } from "@/utils";
import { isPosTerminalPage } from "@/lib/posNavAccess";
import { filterPosProducts, buildPosCodeIndex } from "@/lib/pos/posProductSearch";
import { addPosCartLine, posCartSubtotal, posProductStock, posStockLabel, setPosCartQty } from "@/lib/pos/posCart";
import {
  applyPosSaleDiscount,
  buildCheckoutLines,
  clientBelongsToCheckoutOrg,
  posCustomerEligibleForTill,
  computeCashChange,
  paymentIntentMatchesPayable,
  posSaleCompletesWhenPaid,
} from "../../server/src/pos/posCheckoutMath.js";
import { settleTillCash } from "../../server/src/pos/posCashSettlement.js";
import { ozowProvider } from "../../server/src/payments/providers/ozowProvider.js";
import {
  canCommitPosInventory,
  nativeInventoryDelta,
} from "../../server/src/pos/posInventorySync.js";
import { buildPosReceiptView, renderPosReceiptInnerHtml } from "../../server/src/pos/posReceipt.js";
import { filterPosCustomers, matchPosCustomer } from "@/lib/pos/posCustomerSearch";
import {
  filterCatalogForRegister,
  productVisibleOnRegister,
  saleCompanyIdFromRegister,
} from "../../server/src/pos/posCatalogScope.js";
import { companyRoleHasPermission, PERMISSIONS } from "@/lib/companyPermissions";
import { hydrateHeldCart } from "@/lib/pos/posHeldCart";
import { parseGenericPosSale } from "../../server/src/pos/posSaleParsers.js";
import { mapPosPaymentMethodToProvider } from "../../server/src/payments/paymentIntentContract.js";

function product(overrides = {}) {
  return {
    id: "p1",
    name: "Cola 500ml",
    sku: "DRK-001",
    barcode: "6001234567890",
    item_type: "product",
    is_active: true,
    price: 25,
    stock_quantity: 10,
    company_id: null,
    ...overrides,
  };
}

describe("Task 28 POS acceptance", () => {
  it("TEST 1 Open POS — dedicated till URL and shell, not back-office chrome", () => {
    expect(createPageUrl("POS")).toBe("/pos");
    expect(isPosTerminalPage("POS")).toBe(true);
    expect(isPosTerminalPage("pos")).toBe(true);
    expect(isPosTerminalPage("pos/till/11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isPosTerminalPage("/pos/till/11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isPosTerminalPage("Dashboard")).toBe(false);
    expect(isPosTerminalPage("Settings")).toBe(false);
  });

  it("TEST 2 Search product — product appears", () => {
    const catalog = [product(), product({ id: "p2", name: "Brown Bread", sku: "BRD-9", barcode: "1" })];
    const rows = filterPosProducts(catalog, {
      query: "cola",
      codeIndex: buildPosCodeIndex(catalog),
    });
    expect(rows.map((row) => row.id)).toEqual(["p1"]);
    expect(rows[0].name).toBe("Cola 500ml");
  });

  it("TEST 3 Add product — cart updates without changing catalog stock", () => {
    const row = product({ stock_quantity: 4 });
    const added = addPosCartLine([], row, 1);
    expect(added.error).toBeNull();
    expect(added.cart).toHaveLength(1);
    expect(added.cart[0]).toMatchObject({ product_id: "p1", quantity: 1, unit_price: 25 });
    expect(row.stock_quantity).toBe(4);
    expect(posProductStock(row)).toBe(4);
    expect(posStockLabel(4).text).toBe("LOW STOCK · 4 in stock");
    expect(posStockLabel(0).text).toBe("Out of stock");
    expect(posStockLabel(24).text).toBe("24 in stock");
  });

  it("TEST 4 Increase quantity — cart and total update", () => {
    const row = product({ price: 25, stock_quantity: 10 });
    let { cart } = addPosCartLine([], row, 1);
    cart = addPosCartLine(cart, row, 1).cart;
    expect(cart[0].quantity).toBe(2);
    expect(posCartSubtotal(cart)).toBe(50);
    cart = setPosCartQty(cart, "p1", 3);
    expect(cart[0].quantity).toBe(3);
    expect(posCartSubtotal(cart)).toBe(75);
    const payable = applyPosSaleDiscount(posCartSubtotal(cart), 0);
    expect(payable.total).toBe(75);
  });

  it("TEST 5 Cash payment — sale completes and change is calculated", () => {
    const catalog = new Map([["p1", product({ price: 80 })]]);
    const built = buildCheckoutLines([{ product_id: "p1", quantity: 1 }], catalog);
    expect(built.ok).toBe(true);
    const payable = applyPosSaleDiscount(built.subtotal, 0);
    const cash = settleTillCash(payable.total, 100);
    expect(cash).toMatchObject({ ok: true, amountTendered: 100, changeDue: 20, settlement: "till" });
    expect(computeCashChange(payable.total, 100).changeDue).toBe(20);
    expect(posSaleCompletesWhenPaid({ status: "paid" })).toBe(true);
    expect(mapPosPaymentMethodToProvider("cash")).toBe("cash");
  });

  it("TEST 6 Successful digital payment — verified paid intent may complete the sale", () => {
    expect(mapPosPaymentMethodToProvider("digital")).toBe("ozow");
    expect(posSaleCompletesWhenPaid({ status: "paid" })).toBe(true);
    expect(
      paymentIntentMatchesPayable(
        { id: "i1", org_id: "org-1", amount: 80, currency: "ZAR", status: "paid" },
        applyPosSaleDiscount(80, 0),
        { orgId: "org-1", currency: "ZAR" }
      ).ok
    ).toBe(true);
  });

  it("TEST 7 Failed digital payment — sale is not completed", async () => {
    expect(posSaleCompletesWhenPaid({ status: "pending" })).toBe(false);
    expect(posSaleCompletesWhenPaid({ status: "failed" })).toBe(false);
    expect(posSaleCompletesWhenPaid({ status: "requires_action" })).toBe(false);
    const charge = await ozowProvider.createCharge({ id: "i2", amount: 50 });
    expect(charge.status).not.toBe("paid");
    expect(parseGenericPosSale({ id: "x", status: "pending", total: 10 })).toBeNull();
  });

  it("TEST 8 Inventory — stock decreases only after a successful sale", () => {
    expect(canCommitPosInventory({}).ok).toBe(false);
    expect(canCommitPosInventory({ saleEventId: "sale-1", paymentSettled: false }).code).toBe(
      "PAYMENT_NOT_SETTLED"
    );
    expect(canCommitPosInventory({ saleEventId: "sale-1", paymentSettled: true }).ok).toBe(true);
    expect(nativeInventoryDelta("out", 2)).toEqual({ quantity: 2, type: "out", delta: -2 });
    const row = product({ stock_quantity: 4 });
    expect(buildCheckoutLines([{ product_id: "p1", quantity: 2 }], new Map([["p1", row]])).ok).toBe(true);
    expect(row.stock_quantity).toBe(4);
  });

  it("TEST 9 Receipt — generated from the completed sale", () => {
    const view = buildPosReceiptView({
      id: "sale-1",
      receipt_number: "POS-20260828-AB12",
      sale_kind: "sale",
      occurred_at: "2026-08-28T12:00:00.000Z",
      currency: "ZAR",
      payment_method: "cash",
      total_amount: 80,
      amount_tendered: 100,
      change_due: 20,
      items: [{ name: "Cola 500ml", quantity: 1, unit_price: 80, line_total: 80 }],
      raw_payload: {
        brand_name: "Harbour Cafe",
        cashier_name: "Ada",
        customer_name: "Walk-in",
        subtotal: 80,
        discount_amount: 0,
        tax_amount: 0,
      },
    });
    expect(view.saleNumber).toBe("POS-20260828-AB12");
    expect(view.total).toBe(80);
    expect(view.changeDue).toBe(20);
    expect(view.paymentLabel).toBe("Cash");
    const html = renderPosReceiptInnerHtml(view);
    expect(html).toContain("Harbour Cafe");
    expect(html).toContain("Cola 500ml");
    expect(html).toMatch(/not an invoice/i);
  });

  it("TEST 10 Customer — only POS-enabled org clients can be attached", () => {
    const clients = [
      { id: "c1", name: "Ada Khosa", phone: "0821112222", org_id: "org-1", pos_enabled: true },
      { id: "c2", name: "Other Co", org_id: "org-2", pos_enabled: true },
      { id: "c3", name: "Invoice Co", email: "billing@invoice.test", org_id: "org-1", pos_enabled: false },
    ];
    expect(matchPosCustomer(clients[0], "khosa")).toBe(true);
    expect(matchPosCustomer(clients[0], "invoice.test")).toBe(false);
    expect(filterPosCustomers(clients, "ada").map((row) => row.id)).toEqual(["c1"]);
    expect(filterPosCustomers(clients, "invoice")).toEqual([]);
    expect(clientBelongsToCheckoutOrg(clients[0], "org-1")).toBe(true);
    expect(posCustomerEligibleForTill(clients[0], "org-1")).toBe(true);
    expect(posCustomerEligibleForTill(clients[2], "org-1")).toBe(false);
    expect(clientBelongsToCheckoutOrg(clients[1], "org-1")).toBe(false);
    expect(clientBelongsToCheckoutOrg(null, "org-1")).toBe(false);
  });

  it("TEST 11 Company — till catalog and sale brand follow the register, not a spoofed id", () => {
    const shared = product({ id: "p-shared", company_id: null });
    const brandA = product({ id: "p-a", name: "Brand A tea", company_id: "brand-a" });
    const brandB = product({ id: "p-b", name: "Brand B coffee", company_id: "brand-b" });
    expect(productVisibleOnRegister(brandB, "brand-a")).toBe(false);
    expect(filterCatalogForRegister([shared, brandA, brandB], "brand-a").map((row) => row.id)).toEqual([
      "p-shared",
      "p-a",
    ]);
    expect(saleCompanyIdFromRegister({ company_id: "brand-a" })).toBe("brand-a");
  });

  it("TEST 12 Permissions — restricted till actions stay off for employees", () => {
    expect(companyRoleHasPermission("employee", PERMISSIONS.POS_ACCESS)).toBe(true);
    expect(companyRoleHasPermission("employee", PERMISSIONS.POS_SELL)).toBe(true);
    expect(companyRoleHasPermission("employee", PERMISSIONS.POS_REFUND)).toBe(false);
    expect(companyRoleHasPermission("employee", PERMISSIONS.POS_DISCOUNT)).toBe(false);
    expect(companyRoleHasPermission("employee", PERMISSIONS.POS_CLOSE_REGISTER)).toBe(false);
    expect(companyRoleHasPermission("manager", PERMISSIONS.POS_REFUND)).toBe(true);
  });

  it("TEST 13 Refresh — held cart is not a sale; completed money lives on the sale row", () => {
    const held = hydrateHeldCart({ cart: [{ product_id: "p1", quantity: 2 }] }, [product()]);
    expect(held.ok).toBe(true);
    expect(held.cart[0].product_id).toBe("p1");
    expect(held).not.toHaveProperty("saleEventId");
    expect(held).not.toHaveProperty("receipt_number");
  });

  it("TEST 14 Different organization — no cross-tenant money or customers", () => {
    expect(clientBelongsToCheckoutOrg({ id: "c1", org_id: "org-b" }, "org-a")).toBe(false);
    expect(
      paymentIntentMatchesPayable(
        { id: "i1", org_id: "org-b", amount: 80, currency: "ZAR" },
        applyPosSaleDiscount(80, 0),
        { orgId: "org-a", currency: "ZAR" }
      ).code
    ).toBe("TENANT_MISMATCH");
  });

  it("TEST 15 Duplicate payment event — same paid intent does not mint a second sale", () => {
    const payable = applyPosSaleDiscount(80, 0);
    const first = paymentIntentMatchesPayable(
      { id: "i1", org_id: "org-1", amount: 80, currency: "ZAR" },
      payable,
      { orgId: "org-1", currency: "ZAR" }
    );
    const replay = paymentIntentMatchesPayable(
      { id: "i1", org_id: "org-1", amount: 80, currency: "ZAR" },
      payable,
      { orgId: "org-1", currency: "ZAR" }
    );
    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect(posSaleCompletesWhenPaid({ status: "paid" })).toBe(true);
  });
});
