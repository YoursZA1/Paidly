/**
 * Demo Mode — browser-side state and notices.
 *
 * The browser never *decides* anything about Demo Mode: the server derives it from the database
 * (organizations.is_demo / demo_sessions) and refuses what a demo may not do. This module only keeps
 * the UI honest — the banner, the "message not sent" preview, the simulated-payment dialogs.
 */
import { toast } from "sonner";

export const DEMO_MODE_RESTRICTED = "DEMO_MODE_RESTRICTED";
export const DEMO_MESSAGE_NOT_SENT = "Demo Mode — message not sent.";
export const DEMO_BUSINESS_NAME = "Mavela Café";
export const DEMO_SIGNUP_PATH = "/signup";

let demoActive = false;
const listeners = new Set();

/** Set by useDemoMode (the React source of truth); read by non-React send paths. */
export function setDemoModeActive(value) {
  const next = Boolean(value);
  if (next === demoActive) return;
  demoActive = next;
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function isDemoModeActive() {
  return demoActive;
}

export function subscribeDemoMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Server-set JWT claim (app_metadata cannot be edited by the user). */
export function sessionUserIsDemo(user) {
  const meta = user?.app_metadata || user?.raw_app_meta_data || null;
  return Boolean(meta && meta.paidly_demo === true);
}

/**
 * The action worked inside the demo, but nothing left Paidly. Shows what would have been sent.
 * @param {{ to?: string | null, subject?: string | null, channel?: string, kind?: string } | null} [preview]
 */
export function notifyDemoNotSent(preview = null) {
  const to = preview?.to ? String(preview.to) : null;
  const subject = preview?.subject ? String(preview.subject) : null;
  const detail = [to ? `Would have gone to ${to}` : null, subject ? `“${subject}”` : null].filter(Boolean).join(" · ");
  toast.info(DEMO_MESSAGE_NOT_SENT, {
    id: "paidly-demo-not-sent",
    description: detail || "Emails, SMS and WhatsApp messages are never delivered from Demo Mode.",
  });
}

/** A capability that needs a real account (billing, invites, integrations…). */
export function notifyDemoRestricted(message) {
  toast.info("Available with a real Paidly account", {
    id: "paidly-demo-restricted",
    description: message || "This part of Paidly is switched off in Demo Mode.",
  });
}

/** True when an API response / error body is a Demo Mode refusal. */
export function isDemoRestrictedResponse(body) {
  return Boolean(body && typeof body === "object" && (body.code === DEMO_MODE_RESTRICTED || body.hint === DEMO_MODE_RESTRICTED));
}

/** True when an API response says the message was suppressed. */
export function isDemoNotSentResponse(body) {
  return Boolean(body && typeof body === "object" && body.demo === true && body.sent === false);
}

/** Per-tab "welcome shown" flag so the welcome appears once per demo session. */
export function demoWelcomeKey(userId) {
  return `paidly_demo_welcome_${userId || "anon"}`;
}
