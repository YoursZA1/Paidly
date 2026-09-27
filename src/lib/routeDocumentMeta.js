/**
 * Per-route <title>, meta description, canonical URL and robots directive for the SPA.
 *
 * index.html ships one set of tags for every URL, so without this each page shared the home
 * page's title and canonical (which told search engines /HowTo was a duplicate of /), and private
 * app pages carried no noindex. Public marketing pages are indexable; everything else is not.
 */
import { useEffect } from "react";

export const SITE_ORIGIN = "https://www.paidly.co.za";
const DEFAULT_TITLE = "Paidly — Invoicing for small business";
const DEFAULT_DESCRIPTION =
  "Paidly — Invoicing and cash flow for small businesses. Create invoices, track payments, and manage your business in one place.";

/** Indexable pages: pattern → canonical path, title, description. */
const PUBLIC_PAGES = [
  { match: /^\/(home)?\/?$/i, path: "/", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  {
    match: /^\/how-?to\/?$/i,
    path: "/HowTo",
    title: "How to use Paidly — Guides",
    description: "Step-by-step guides for invoices, quotes, payments, POS and payroll in Paidly.",
  },
  {
    match: /^\/(privacy-policy|privacypolicy)\/?$/i,
    path: "/privacy-policy",
    title: "Privacy Policy · Paidly",
    description: "How Paidly collects, uses and protects your personal information (POPIA).",
  },
  {
    match: /^\/(terms|terms-and-conditions|termsandconditions)\/?$/i,
    path: "/terms",
    title: "Terms and Conditions · Paidly",
    description: "The terms that apply when you use Paidly.",
  },
];

/** Titles for app pages whose route name does not read well when split on capitals. */
const TITLE_OVERRIDES = {
  "": "Paidly",
  pos: "Point of Sale",
  "pos/till": "Point of Sale",
  pay: "Pay",
  "auth/verified": "Verify your email",
  login: "Sign in",
  auth: "Sign in",
  signup: "Create your account",
  forgotpassword: "Reset your password",
  resetpassword: "Choose a new password",
  publicinvoice: "Invoice",
  publicquote: "Quote",
  publicpayslip: "Payslip",
  view: "Invoice",
  "leave-approval": "Leave approval",
  clientportal: "Client portal",
  "admin-v2": "Admin",
};

function humanize(segment) {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * @param {string} pathname
 * @returns {{ title: string, description: string, canonical: string | null, indexable: boolean }}
 */
export function resolveRouteDocumentMeta(pathname) {
  const p = String(pathname || "/");
  const page = PUBLIC_PAGES.find((entry) => entry.match.test(p));
  if (page) {
    return {
      title: page.title,
      description: page.description,
      canonical: `${SITE_ORIGIN}${page.path}`,
      indexable: true,
    };
  }

  const segments = p.replace(/^\/+|\/+$/g, "").split("/");
  const first = (segments[0] || "").toLowerCase();
  const two = `${first}/${(segments[1] || "").toLowerCase()}`;
  // /admin-v2/users → "Admin · Users"; /Invoices → "Invoices". Only the first (static) segment is
  // used elsewhere, so ids and tokens in later segments never reach the title.
  const name =
    first === "admin-v2" && segments[1]
      ? `Admin · ${humanize(segments[1])}`
      : TITLE_OVERRIDES[two] ?? TITLE_OVERRIDES[first] ?? humanize(segments[0] || "");
  return {
    title: name && name !== "Paidly" ? `${name} · Paidly` : "Paidly",
    description: DEFAULT_DESCRIPTION,
    canonical: null,
    indexable: false,
  };
}

function upsertMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Applies route metadata when the path changes. Pages may still set a more specific title. */
export function useRouteDocumentMeta(pathname) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const meta = resolveRouteDocumentMeta(pathname);
    document.title = meta.title;
    upsertMeta("name", "description", meta.description);
    upsertMeta("name", "robots", meta.indexable ? "index, follow" : "noindex, nofollow");
    upsertMeta("property", "og:title", meta.title);
    upsertMeta("property", "og:description", meta.description);
    if (meta.canonical) upsertMeta("property", "og:url", meta.canonical);
    setCanonical(meta.canonical);
  }, [pathname]);
}

/** Render before the routes so page-level title effects (which run later) still win. */
export function RouteDocumentMeta({ pathname }) {
  useRouteDocumentMeta(pathname);
  return null;
}
