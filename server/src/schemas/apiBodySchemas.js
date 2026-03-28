import { z } from "zod";
import {
  isReasonablePasswordLength,
  isValidEmail,
} from "../inputValidation.js";

/**
 * Never trust raw email strings: trim → lowercase → `z.string().email()`, then `isValidEmail`
 * for length / control-char rules aligned with `inputValidation.js`.
 */
export const apiEmailSchema = z
  .string()
  .trim()
  .transform((s) => s.toLowerCase())
  .pipe(z.string().email({ message: "Invalid email" }))
  .refine((s) => isValidEmail(s), { message: "Invalid email" });

export const apiPasswordSchema = z
  .string()
  .refine((p) => isReasonablePasswordLength(p), { message: "Invalid password" });

export const signInBodySchema = z.object({
  email: apiEmailSchema,
  password: apiPasswordSchema,
});

/** Optional sign-up profile payload; still passed through `sanitizeSignUpUserMetadata`. */
export const signUpBodySchema = z.object({
  email: apiEmailSchema,
  password: apiPasswordSchema,
  /** Supabase user_metadata; omitted or null OK */
  data: z.record(z.string(), z.unknown()).nullish(),
});

const optionalTrimmedLine = (max) =>
  z.preprocess(
    (v) => (v === null || v === undefined ? undefined : String(v)),
    z.string().trim().max(max).optional()
  );

export const waitlistBodySchema = z.object({
  email: apiEmailSchema,
  name: optionalTrimmedLine(120),
  source: optionalTrimmedLine(64),
});
