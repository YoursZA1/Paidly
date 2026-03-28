import { z } from "zod";
import { apiEmailSchema } from "./apiBodySchemas.js";

/**
 * Example invoice-like payload (e.g. a future “create invoice” API or shared client/server contract).
 * Uses `apiEmailSchema` (trim, lowercase, `z.email()`, then server `isValidEmail`).
 *
 * **Validate before insert** (server):
 * ```js
 * import { validateBeforeInsert } from "../validateBody.js";
 * const row = validateBeforeInsert(invoiceSchema, req.body, res);
 * if (!row) return;
 * await supabase.from("invoices").insert(row);
 * ```
 * Or inline: `const result = invoiceSchema.safeParse(data);` then `if (!result.success) return res.status(400).json({ error: result.error.flatten() });`
 */
export const invoiceSchema = z.object({
  client_name: z.string().trim().min(2).max(100),
  email: apiEmailSchema,
  amount: z.number().positive().max(1_000_000_000),
  description: z.string().max(500),
});

const optionalLine = (max) =>
  z.preprocess(
    (v) =>
      v === null || v === undefined || v === "" ? undefined : String(v).trim(),
    z.string().max(max).optional()
  );

/** Body for `POST /api/send-invoice` (PDF + routing fields). */
export const sendInvoiceBodySchema = z.object({
  base64PDF: z.string().min(1, "PDF payload required"),
  clientEmail: apiEmailSchema,
  invoiceNum: z.preprocess(
    (v) => (v == null ? "" : String(v).trim()),
    z.string().min(1, "Invoice number required").max(120)
  ),
  fromName: optionalLine(200),
  clientName: optionalLine(200),
  amountDue: optionalLine(80),
  dueDate: optionalLine(80),
});
