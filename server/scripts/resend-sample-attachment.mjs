/**
 * Dev smoke test: send HTML email with a base64 text attachment via Resend.
 *
 * Usage (from repo root):
 *   npm --prefix server run resend:sample
 *
 * Requires server/.env or env:
 *   RESEND_API_KEY=re_...
 *   RESEND_FROM=Paidly <invoices@paidly.co.za>   (or Resend onboarding domain for tests)
 */
import "dotenv/config";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("Set RESEND_API_KEY (e.g. in server/.env)");
  process.exit(1);
}

const resend = new Resend(apiKey);
const from =
  process.env.RESEND_FROM ||
  process.env.EMAIL_FROM ||
  "Acme <onboarding@resend.dev>";

const to = process.env.RESEND_SAMPLE_TO || "delivered@resend.dev";

const fileContent = `Sample Attachment\n==================\n\nThis file was attached to your email.\nSent at: ${new Date().toISOString()}\n`;
const encoded = Buffer.from(fileContent).toString("base64");

const { data, error } = await resend.emails.send({
  from,
  to: [to],
  subject: "Email with Attachment (Paidly sample)",
  html: "<h1>Your attachment is ready</h1><p>Please find the file attached to this email.</p>",
  attachments: [
    {
      filename: "sample.txt",
      content: encoded,
    },
  ],
});

if (error) {
  console.error("Error sending email:", error);
  process.exit(1);
}

console.log("Email with attachment sent successfully!");
console.log("Email ID:", data?.id);
