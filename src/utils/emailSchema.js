import { z } from "zod";

/**
 * Email fields in forms: trim whitespace, normalize to lowercase, validate with Zod `.email()`.
 * Server routes should still use `apiEmailSchema` + backend checks — client validation is UX only.
 */
export const emailFieldSchema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().email({ message: "Invalid email" }));
