import { beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_RESET_INVOICE_ID,
  DEMO_SANDBOX_TOKEN,
  buildDemoBootstrap,
  clearDemoSandbox,
  demoFrom,
  demoRpc,
  installSandboxSession,
  isDemoSandbox,
  resetDemoSandbox,
} from "../../src/lib/demo/demoSandboxStore.js";
import { demoPosResponse } from "../../src/lib/demo/demoPosSandbox.js";
import { demoPayrollRequest } from "../../src/lib/demo/demoPayrollSandbox.js";
import { startLiveDemo } from "../../src/lib/demo/demoModeApi.js";
import { payrollApi } from "../../src/services/PayrollApiService.js";

describe("demo sandbox", () => {
  beforeEach(() => {
    clearDemoSandbox();
  });

  it("starts without a production token and with the full dataset", async () => {
    const started = await startLiveDemo();
    expect(started.businessName).toBe("Mavela Café");
    expect(isDemoSandbox()).toBe(true);
    const boot = buildDemoBootstrap();
    expect(boot.recentInvoices).toHaveLength(20);
    expect(boot.dashboard.clients).toHaveLength(15);
    expect(boot.dashboard.quotes).toHaveLength(8);
    expect(boot.dashboard.expenses.length).toBeGreaterThanOrEqual(6);
    expect(boot.dashboard.payslips).toHaveLength(4);
    expect(boot.recentInvoices.find((row) => row.id === DEMO_RESET_INVOICE_ID).status).toBe("sent");
    expect(boot.recentInvoices.find((row) => row.id === DEMO_RESET_INVOICE_ID).total_amount).toBe(5000);
  });

  it("keeps mutations in the sandbox and reset restores the original invoice", async () => {
    installSandboxSession();
    const before = await demoFrom("invoices").select("id,status").eq("id", DEMO_RESET_INVOICE_ID).maybeSingle();
    expect(before.data.status).toBe("sent");
    await demoFrom("invoices").update({ status: "paid", amount_paid: 5000 }).eq("id", DEMO_RESET_INVOICE_ID);
    const paid = await demoFrom("invoices").select("status").eq("id", DEMO_RESET_INVOICE_ID).single();
    expect(paid.data.status).toBe("paid");
    resetDemoSandbox();
    const restored = await demoFrom("invoices").select("status,total_amount").eq("id", DEMO_RESET_INVOICE_ID).single();
    expect(restored.data.status).toBe("sent");
    expect(restored.data.total_amount).toBe(5000);
  });

  it("does not answer queries until the sandbox is installed", async () => {
    expect(isDemoSandbox()).toBe(false);
    installSandboxSession();
    const { data } = await demoFrom("clients").select("id").eq("org_id", "a2000001-0000-4000-8000-000000000001");
    expect(data.length).toBe(15);
  });

  it("converts a quote inside the sandbox", async () => {
    installSandboxSession();
    const quote = await demoFrom("quotes").select("id").eq("status", "accepted").limit(1).maybeSingle();
    const converted = await demoRpc("convert_quote_to_invoice", { p_quote_id: quote.data.id });
    expect(converted.error).toBeNull();
    expect(converted.data.invoice_id).toBeTruthy();
    expect(converted.data.invoice_number).toMatch(/^INV-/);
    const again = await demoRpc("convert_quote_to_invoice", { p_quote_id: quote.data.id });
    expect(again.data.already_converted).toBe(true);
    expect(again.data.invoice_id).toBe(converted.data.invoice_id);
  });

  it("checks out a till sale and walks a table from kitchen to paid", async () => {
    installSandboxSession();
    const catalogRes = await demoPosResponse("/api/pos/catalog");
    const catalog = await catalogRes.json();
    expect(catalog.products.length).toBeGreaterThanOrEqual(8);
    expect(catalog.digital_provider.demo).toBe(true);
    expect(catalogRes.ok).toBe(true);

    const product = catalog.products[0];
    const saleRes = await demoPosResponse("/api/pos/checkout", {
      method: "POST",
      body: JSON.stringify({
        payment_method: "digital",
        items: [{ product_id: product.id, quantity: 2 }],
      }),
    });
    const saleBody = await saleRes.json();
    expect(saleBody.pending).toBe(false);
    expect(saleBody.sale.receipt_number).toMatch(/^DEMO-/);
    expect(saleBody.sale.payment_method).toBe("digital");
    expect(saleBody.sale.total_amount).toBe(product.price * 2);

    const floorRes = await demoPosResponse("/api/pos/floor");
    const floor = await floorRes.json();
    const table = floor.tables[0];
    const opened = await (
      await demoPosResponse("/api/pos/tab", {
        method: "POST",
        body: JSON.stringify({ action: "open", table_id: table.id, guests: 2, order_type: "dine_in" }),
      })
    ).json();
    const added = await (
      await demoPosResponse("/api/pos/tab", {
        method: "POST",
        body: JSON.stringify({
          action: "add_items",
          tab_id: opened.tab.id,
          items: [{ product_id: product.id, quantity: 1 }],
        }),
      })
    ).json();
    expect(added.items[0].status).toBe("pending");
    const sent = await (
      await demoPosResponse("/api/pos/tab", {
        method: "POST",
        body: JSON.stringify({ action: "send", tab_id: opened.tab.id }),
      })
    ).json();
    expect(sent.sent_tickets.length).toBe(1);
    const ticketId = sent.sent_tickets[0].id;
    await demoPosResponse("/api/pos/kitchen", {
      method: "POST",
      body: JSON.stringify({ ticket_id: ticketId, status: "preparing" }),
    });
    const ready = await (
      await demoPosResponse("/api/pos/kitchen", {
        method: "POST",
        body: JSON.stringify({ ticket_id: ticketId, status: "ready" }),
      })
    ).json();
    expect(ready.ticket.status).toBe("ready");
    const paid = await (
      await demoPosResponse("/api/pos/tab-pay", {
        method: "POST",
        body: JSON.stringify({ tab_id: opened.tab.id, payment_method: "digital" }),
      })
    ).json();
    expect(paid.tab.balance.settled).toBe(true);
    expect(paid.sale.receipt_number).toMatch(/^DEMO-/);
    expect(DEMO_SANDBOX_TOKEN.startsWith("eyJ")).toBe(false);
  });

  it("builds the payroll register from seeded payslips without a JWT", async () => {
    installSandboxSession();
    const report = demoPayrollRequest("/api/payroll/reports?type=net_pay");
    expect(report.report.rows).toHaveLength(4);
    expect(report.report.rows.map((row) => row.employee_name)).toEqual(
      expect.arrayContaining(["Sipho Nkosi", "Elena Rossi"])
    );
    const viaApi = await payrollApi.reports({ type: "summary" });
    expect(viaApi.report.employee_count).toBe(4);
    expect(viaApi.report.net_payroll).toBeGreaterThan(0);
    const summary = demoPayrollRequest("/api/company/workforce-summary");
    expect(summary.payroll.payslips_generated).toBe(4);
    expect(summary.workforce.active).toBe(4);
    const directory = demoPayrollRequest("/api/company/employees?status=active");
    expect(directory.items).toHaveLength(4);
    expect(directory.items.map((row) => row.full_name)).toEqual(
      expect.arrayContaining(["Sipho Nkosi", "Elena Rossi"])
    );
    expect(directory.items.every((row) => row.employee_number)).toBe(true);
    const overview = demoPayrollRequest("/api/payroll/overview");
    expect(overview.employees).toBe(4);
    expect(overview.current_run.status).toBe("paid");
    expect(overview.total_net).toBeGreaterThan(0);
    const opened = demoPayrollRequest(`/api/payroll/runs/${overview.current_run.id}`);
    expect(opened.items).toHaveLength(4);
    expect(opened.items.reduce((sum, row) => sum + row.net_pay, 0)).toBeCloseTo(overview.total_net, 2);
    const org = demoPayrollRequest("/api/company/workforce-organogram");
    expect(org.company.name).toBe("Mavela Café");
    expect(org.stats.active).toBe(4);
    const elena = org.roots.find((node) => node.full_name === "Elena Rossi");
    expect(elena.children.map((child) => child.full_name).sort()).toEqual([
      "Karabo Molefe",
      "Megan Adams",
      "Sipho Nkosi",
    ]);
    const pending = demoPayrollRequest("/api/leave/requests?status=pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].payroll_profiles.full_name).toBe("Sipho Nkosi");
    expect(pending[0].leave_types.name).toBe("Annual leave");
    const approved = demoPayrollRequest(`/api/leave/requests/${pending[0].id}/approve`, { method: "POST", body: {} });
    expect(approved.status).toBe("approved");
    expect(demoPayrollRequest("/api/leave/requests?status=pending")).toHaveLength(0);
  });
});
