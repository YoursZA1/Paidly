import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resendSendCalls } from "../mocks/resend-test-double.js";
import { sendHtmlEmail } from "../../server/src/sendInvoice.js";

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
});
