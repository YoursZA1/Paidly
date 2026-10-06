/**
 * dispatchDocumentEmail: non-invoice documents (purchase orders) opt out of the /api/send-invoice
 * fallback, which would rename the attachment Invoice_<num>.pdf and use the invoice template.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/core/auth/SessionCoordinator", () => ({
  getStableSessionResult: async () => ({ data: { session: { access_token: "tok" } } }),
  getStableSession: async () => ({ access_token: "tok" }),
}));
vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");

const { dispatchDocumentEmail } = await import("../../src/document-engine/send/email.js");

afterEach(() => vi.unstubAllGlobals());

const edgeDown = () =>
  vi.fn(async (url) =>
    String(url).includes("/functions/v1/")
      ? new Response(JSON.stringify({ success: false, error: "provider down" }), { status: 502 })
      : new Response(JSON.stringify({ success: true }), { status: 200 })
  );

describe("dispatchDocumentEmail fallback", () => {
  it("invoices send through /api/send-invoice and skip the undeployed edge function", async () => {
    const fetchSpy = edgeDown();
    vi.stubGlobal("fetch", fetchSpy);
    const out = await dispatchDocumentEmail({ pdfBase64: "JVBERi0=", email: "a@b.co", subject: "Invoice", html: "<p/>" });
    expect(out.channel).toBe("api");
    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual([
      expect.stringContaining("/api/send-invoice"),
    ]);
  });

  it("forwards quote html, subject, and filename on the invoice route", async () => {
    const fetchSpy = edgeDown();
    vi.stubGlobal("fetch", fetchSpy);
    await dispatchDocumentEmail({
      pdfBase64: "JVBERi0=",
      email: "a@b.co",
      subject: "Quote #QUO-1001 from BrandCafé Agency",
      html: "<a href=\"https://www.paidly.co.za/PublicQuote?token=abc\">View Quote</a>",
      filename: "QUO-1001.pdf",
      invoiceNum: "QUO-1001",
    });
    const fallback = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(fallback.subject).toContain("Quote #QUO-1001");
    expect(fallback.html).toContain("View Quote");
    expect(fallback.html).toContain("/PublicQuote?token=");
    expect(fallback.filename).toBe("QUO-1001.pdf");
  });

  it("invoiceApiFallback: false surfaces the edge failure instead", async () => {
    const fetchSpy = edgeDown();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      dispatchDocumentEmail({
        pdfBase64: "JVBERi0=",
        email: "a@b.co",
        subject: "Purchase Order PO-1001",
        html: "<p/>",
        filename: "PO-1001.pdf",
        invoiceApiFallback: false,
      })
    ).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).filename).toBe("PO-1001.pdf");
  });
});
