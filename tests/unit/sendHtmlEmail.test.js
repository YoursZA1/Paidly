import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resendSendCalls } from "../mocks/resend-test-double.js";
import { sendHtmlEmail, sendInvoiceEmail } from "../../server/src/sendInvoice.js";

describe("sendHtmlEmail", () => {
  let prevKey;
  let prevFrom;

  beforeEach(() => {
    prevKey = process.env.RESEND_API_KEY;
    prevFrom = process.env.RESEND_FROM;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "Paidly <noreply@example.test>";
    resendSendCalls.length = 0;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = prevFrom;
  });

  it("4-arg form: merges text into the Resend payload when the 4th argument is mail options", async () => {
    const result = await sendHtmlEmail("user@example.com", "Hello", "<p>Hi</p>", {
      text: "Plain version",
    });

    expect(result.success).toBe(true);
    expect(resendSendCalls).toHaveLength(1);
    expect(resendSendCalls[0]).toMatchObject({
      to: ["user@example.com"],
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Plain version",
    });
  });

  it("5-arg form: still merges text from the 5th argument", async () => {
    const result = await sendHtmlEmail("user@example.com", "Subj", "<p>x</p>", "Acme Co", {
      text: "Plain five",
    });

    expect(result.success).toBe(true);
    expect(resendSendCalls[0]).toMatchObject({
      text: "Plain five",
    });
  });

  it("quote override keeps the View Quote html and quote filename", async () => {
    const result = await sendInvoiceEmail(
      "JVBERi0xLjQK",
      "client@example.com",
      "QUO-1001",
      "BrandCafé Agency",
      { clientName: "On The Design Agency", amountDue: "", dueDate: "2026-10-09" },
      "",
      {
        subject: "Quote #QUO-1001 from BrandCafé Agency",
        html: '<a href="https://www.paidly.co.za/PublicQuote?token=abc">View Quote</a>',
        filename: "QUO-1001.pdf",
      }
    );
    expect(result.success).toBe(true);
    expect(resendSendCalls.at(-1).subject).toBe("Quote #QUO-1001 from BrandCafé Agency");
    expect(resendSendCalls.at(-1).html).toContain("View Quote");
    expect(resendSendCalls.at(-1).html).not.toContain("Please find attached your invoice");
    expect(resendSendCalls.at(-1).attachments[0].filename).toBe("QUO-1001.pdf");
  });
});
