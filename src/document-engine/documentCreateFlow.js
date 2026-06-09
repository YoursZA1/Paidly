/**
 * Document creation routing — maps catalog types to the right compose experience.
 *
 * The Documents hub "New Document" menu is data-driven; each type resolves to either:
 * - invoice/quote compose (`CreateDocument/:type`)
 * - a bespoke page (payslip, leave request, expense claim)
 * - a typed form profile (`CreateTypedDocument/:type`) for all other catalog types
 * - an inline hub draft (fallback when no profile exists)
 *
 * To add a bespoke page: register in `DEDICATED_CREATE_PAGES` + build the page.
 * To customize fields for a catalog type: extend `documentFormProfiles.js` (no menu changes).
 */
import { createPageUrl } from "@/utils";
import { getTypeDef } from "./documentCatalog";
import { hasDocumentFormProfile } from "./documentFormProfiles";

/** @typedef {"compose"|"dedicated"|"typed"|"hub"} DocumentCreateFlowMode */

export const DOCUMENT_CREATE_FLOW = Object.freeze({
  compose: "compose",
  dedicated: "dedicated",
  typed: "typed",
  hub: "hub",
});

/**
 * Catalog types with a bespoke create page (not the shared typed form shell).
 * @type {Readonly<Record<string, { page: string, title: string }>>}
 */
export const DEDICATED_CREATE_PAGES = Object.freeze({
  payslip: { page: "CreatePayslip", title: "New Payslip" },
  leave_request: { page: "CreateLeaveRequest", title: "New Leave Request" },
  expense_claim: { page: "CreateExpenseClaim", title: "New Expense Claim" },
});

/** Types that share the invoice/quote compose shell (`CreateDocument/:type`). */
const COMPOSE_SHELL_TYPES = new Set(["invoice", "quote"]);

/** @param {unknown} typeKey @returns {DocumentCreateFlowMode} */
export function resolveDocumentCreateFlow(typeKey) {
  const key = String(typeKey || "").trim();
  if (COMPOSE_SHELL_TYPES.has(key)) return DOCUMENT_CREATE_FLOW.compose;
  if (DEDICATED_CREATE_PAGES[key]) return DOCUMENT_CREATE_FLOW.dedicated;
  if (hasDocumentFormProfile(key)) return DOCUMENT_CREATE_FLOW.typed;
  return DOCUMENT_CREATE_FLOW.hub;
}

/**
 * When non-null, the hub should navigate here instead of creating a draft inline.
 * @param {unknown} typeKey
 * @returns {string | null}
 */
export function getDedicatedCreatePath(typeKey) {
  const key = String(typeKey || "").trim();
  const flow = resolveDocumentCreateFlow(key);
  if (flow === DOCUMENT_CREATE_FLOW.compose) {
    return createPageUrl(`CreateDocument/${key}`);
  }
  const entry = DEDICATED_CREATE_PAGES[key];
  if (entry) return createPageUrl(entry.page);
  if (flow === DOCUMENT_CREATE_FLOW.typed) {
    return createPageUrl(`CreateTypedDocument/${key}`);
  }
  return null;
}

/** @param {unknown} typeKey */
export function usesDedicatedCreatePage(typeKey) {
  return getDedicatedCreatePath(typeKey) != null;
}

/**
 * Human label for the dedicated create page header.
 * @param {unknown} typeKey
 */
export function dedicatedCreateTitle(typeKey) {
  const key = String(typeKey || "").trim();
  const entry = DEDICATED_CREATE_PAGES[key];
  if (entry?.title) return entry.title;
  const def = getTypeDef(key);
  if (def?.label) return `New ${def.label}`;
  if (resolveDocumentCreateFlow(key) === DOCUMENT_CREATE_FLOW.compose) return "New Document";
  return "New Document";
}
