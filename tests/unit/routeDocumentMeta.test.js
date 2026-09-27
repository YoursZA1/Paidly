import { describe, expect, it } from "vitest";
import { resolveRouteDocumentMeta, SITE_ORIGIN } from "@/lib/routeDocumentMeta";

describe("resolveRouteDocumentMeta", () => {
  it("gives public pages their own title and a self-referencing canonical", () => {
    const howTo = resolveRouteDocumentMeta("/how-to");
    expect(howTo.indexable).toBe(true);
    expect(howTo.canonical).toBe(`${SITE_ORIGIN}/HowTo`);
    expect(howTo.title).not.toBe(resolveRouteDocumentMeta("/").title);
    expect(resolveRouteDocumentMeta("/").canonical).toBe(`${SITE_ORIGIN}/`);
    expect(resolveRouteDocumentMeta("/PrivacyPolicy").canonical).toBe(`${SITE_ORIGIN}/privacy-policy`);
  });

  it("marks app, auth and shared-document pages noindex with no canonical", () => {
    for (const path of ["/Dashboard", "/Invoices", "/admin-v2/users", "/view/abc123", "/PublicPayslip", "/login", "/pos"]) {
      const meta = resolveRouteDocumentMeta(path);
      expect(meta.indexable, path).toBe(false);
      expect(meta.canonical, path).toBeNull();
    }
  });

  it("builds readable titles and never puts ids or tokens in them", () => {
    expect(resolveRouteDocumentMeta("/CreateInvoice").title).toBe("Create Invoice · Paidly");
    expect(resolveRouteDocumentMeta("/admin-v2/payment-intents").title).toBe("Admin · Payment intents · Paidly");
    expect(resolveRouteDocumentMeta("/view/tok_secret123").title).toBe("Invoice · Paidly");
    expect(resolveRouteDocumentMeta("/employees/7f3c").title).toBe("Employees · Paidly");
  });
});
