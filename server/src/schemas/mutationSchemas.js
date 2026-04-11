import { z } from "zod";
import {
  apiEmailSchema,
  apiPasswordSchema,
} from "./apiBodySchemas.js";
import {
  isValidSubscriptionId,
  isValidTrackingToken,
} from "../inputValidation.js";

/** POST /api/track-open */
export const trackOpenBodySchema = z.object({
  token: z
    .string()
    .min(1)
    .transform((s) => s.trim())
    .refine((t) => isValidTrackingToken(t), { message: "Invalid token" }),
});

const HTML_PDF_MAX = 10 * 1024 * 1024;

/** POST /api/generate-pdf-html */
export const generatePdfHtmlBodySchema = z.object({
  html: z.string().min(1).max(HTML_PDF_MAX),
  css: z.string().max(6 * 1024 * 1024).optional(),
  title: z.union([z.string(), z.null()]).optional(),
  filename: z.union([z.string(), z.null()]).optional(),
  page: z.record(z.string(), z.unknown()).nullish().optional(),
});

/** POST /api/send-email */
export const sendEmailBodySchema = z.object({
  to: apiEmailSchema,
  subject: z.string().trim().min(1).max(998),
  body: z.string().optional().default(""),
});

/** POST /api/payfast/subscription */
export const payfastSubscriptionBodySchema = z.object({
  subscriptionId: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((s) => isValidSubscriptionId(s), {
      message: "Invalid subscription id",
    }),
  userEmail: apiEmailSchema,
  amount: z.union([z.number(), z.string()]),
  userId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : String(v).trim()),
    z.string().uuid({ message: "userId must be the signed-in user UUID (links PayFast ITN to profile)" })
  ),
  userName: z.union([z.string(), z.null()]).optional(),
  plan: z.union([z.string(), z.null()]).optional(),
  billingCycle: z.string().optional(),
  currency: z.string().optional(),
  returnUrl: z.union([z.string(), z.null()]).optional(),
  cancelUrl: z.union([z.string(), z.null()]).optional(),
  notifyUrl: z.union([z.string(), z.null()]).optional(),
  itemDescription: z.union([z.string(), z.null()]).optional(),
  billingDate: z.union([z.string(), z.null()]).optional(),
  cycles: z.union([z.number(), z.string(), z.null()]).optional(),
  subscriptionNotifyEmail: z.union([z.boolean(), z.string(), z.null()]).optional(),
  subscriptionNotifyWebhook: z.union([z.boolean(), z.string(), z.null()]).optional(),
  subscriptionNotifyBuyer: z.union([z.boolean(), z.string(), z.null()]).optional(),
});

/** POST /api/payfast/once */
export const payfastOnceBodySchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.union([z.number(), z.string()]),
  currency: z.string().optional(),
  clientName: z.union([z.string(), z.null()]).optional(),
  clientEmail: apiEmailSchema,
  returnUrl: z.union([z.string(), z.null()]).optional(),
  cancelUrl: z.union([z.string(), z.null()]).optional(),
});

/** POST /api/admin/roles */
export const adminRolesBodySchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "user"]),
});

/** POST /api/admin/invite-user */
export const adminInviteBodySchema = z.object({
  email: apiEmailSchema,
  full_name: z.union([z.string(), z.null()]).optional(),
  role: z.union([z.string(), z.null()]).optional(),
  plan: z.union([z.string(), z.null()]).optional(),
  redirect_to: z.union([z.string(), z.null()]).optional(),
});

/** POST /api/admin/bootstrap */
export const adminBootstrapBodySchema = z.object({
  email: apiEmailSchema,
  password: apiPasswordSchema,
  role: z.enum(["admin", "user"]).optional(),
});

export const adminUpdateUserBodySchema = z.object({
  plan: z.union([
    z.literal("free"),
    z.literal("starter"),
    z.literal("professional"),
    z.literal("enterprise"),
  ]).optional(),
  full_name: z.string().trim().min(1).max(255).optional(),
  user_metadata: z.record(z.any()).optional(),
});
