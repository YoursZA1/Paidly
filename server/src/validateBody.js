import { z } from "zod";

/**
 * Validate **before** insert (or any trusted write). Same idea as:
 * `const result = schema.safeParse(data); if (!result.success) return res.status(400).json(...)`
 *
 * Uses `error.flatten()` in the JSON body so the payload is serializable (prefer over passing
 * the raw `ZodError` instance as `error`).
 *
 * @template {z.ZodTypeAny} S
 * @param {S} schema
 * @param {unknown} data — e.g. `req.body` or a row you are about to insert
 * @param {import("express").Response} res
 * @returns {z.infer<S> | null}
 *
 * @example
 * const data = validateBeforeInsert(invoiceSchema, req.body, res);
 * if (!data) return;
 * await supabase.from("invoices").insert(data);
 */
export function validateBeforeInsert(schema, data, res) {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: result.error.flatten() });
    return null;
  }
  return result.data;
}

/**
 * Parse `req.body` with a Zod schema. On failure responds with 400 and returns null.
 * Use on the API for real input validation (not replaceable by client-side checks).
 *
 * @template {z.ZodTypeAny} S
 * @param {S} schema
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {(err: z.ZodError) => void} [onInvalid] — e.g. logSecurity before returning 400
 * @returns {z.infer<S> | null}
 */
export function parseBody(schema, req, res, onInvalid) {
  const result = schema.safeParse(req.body ?? {});
  if (result.success) {
    return result.data;
  }
  onInvalid?.(result.error);
  const flat = result.error.flatten();
  res.status(400).json({
    error: "Invalid request",
    message: flat.formErrors[0] || "Validation failed",
    details: flat.fieldErrors,
  });
  return null;
}
