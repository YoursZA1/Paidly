/**
 * Demo Mode: the client document-email path (invoice / quote emails) never reaches the edge function
 * or /api/send-invoice while a demo is active — the visitor gets the "message not sent" preview.
 * (The edge function and the API refuse demo users server-side as well.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

const { dispatchDocumentEmail } = await import("../../src/document-engine/send/email.js");
const { setDemoModeActive } = await import("../../src/lib/demo/demoModeState.js");
const { toast } = await import("sonner");

afterEach(() => {
  setDemoModeActive(false);
  vi.unstubAllGlobals();
});

describe("dispatchDocumentEmail in Demo Mode", () => {
  it("does not call any email endpoint and returns a demo result", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setDemoModeActive(true);
    const out = await dispatchDocumentEmail({
      pdfBase64: "JVBERi0=",
      email: "thandi@nkosievents.example",
      subject: "Invoice INV-1021 from Mavela Café",
      html: "<p>Hi</p>",
    });
    expect(out).toMatchObject({ success: true, demo: true, sent: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "Demo Mode — message not sent.",
      expect.objectContaining({ description: expect.stringContaining("thandi@nkosievents.example") })
    );
  });
});
