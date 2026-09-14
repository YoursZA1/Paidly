/**
 * Vercel Hobby only invokes `api/company/[[...path]].js` for **one** extra
 * path segment (`/api/company/invite`). Nested URLs such as
 * `/api/company/invites/:id/resend` never reach this file unless `vercel.json`
 * flattens them onto a one-segment alias.
 *
 * Express still registers the nested URLs for `npm run server`.
 */

function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  if (value == null || value === "") return "";
  return String(value).trim();
}

function partsFromRequest(req) {
  const raw = req?.query?.path;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (raw != null && raw !== "") {
    return String(raw)
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  const rawUrl = String(req?.url || "").split("?")[0] || "";
  const rest = rawUrl.replace(/^\/api\/company\/?/i, "");
  return rest.split("/").filter(Boolean);
}

/**
 * @param {{ url?: string, query?: Record<string, unknown> }} req
 * @returns {null | { route: string, parts: string[], id?: string }}
 */
export function resolveCompanyRoute(req) {
  const query = req?.query && typeof req.query === "object" ? req.query : {};
  const queryId = firstQueryValue(query.id);
  const parts = partsFromRequest(req);
  const head = parts[0] || "";
  const second = parts[1] || "";
  const third = parts[2] || "";

  if (head === "invite-resend") return { route: "invite-resend", parts, id: queryId || second };
  if (head === "invite-revoke" || head === "invite-by-id") {
    return { route: "invite-revoke", parts, id: queryId || second };
  }
  if (head === "invite-validate") return { route: "invite-validate", parts };

  if (head === "invites") {
    if (!second) return { route: "invites-list", parts };
    if (third === "resend") return { route: "invite-resend", parts, id: second };
    return { route: "invite-revoke", parts, id: second };
  }

  if (head === "invite") {
    if (second === "validate") return { route: "invite-validate", parts };
    return { route: "team-invite", parts };
  }

  if (head === "role") return { route: "team-role", parts };
  if (head === "context") return { route: "context", parts };

  const urlPath = String(req?.url || "").split("?")[0] || "";
  if (urlPath.endsWith("/invite-validate") || urlPath.endsWith("/invite/validate")) {
    return { route: "invite-validate", parts };
  }
  if (urlPath.endsWith("/invite-resend") || /\/invites\/[^/]+\/resend$/i.test(urlPath)) {
    const match = urlPath.match(/\/invites\/([^/]+)\/resend$/i);
    return { route: "invite-resend", parts, id: queryId || match?.[1] || "" };
  }
  if (urlPath.endsWith("/invite-by-id") || urlPath.endsWith("/invite-revoke")) {
    return { route: "invite-revoke", parts, id: queryId };
  }
  if (/\/invites\/[^/]+$/i.test(urlPath) && String(req?.method || "").toUpperCase() === "DELETE") {
    const match = urlPath.match(/\/invites\/([^/]+)$/i);
    return { route: "invite-revoke", parts, id: queryId || match?.[1] || "" };
  }
  if (urlPath.endsWith("/invites")) return { route: "invites-list", parts };
  if (urlPath.endsWith("/invite")) return { route: "team-invite", parts };
  if (urlPath.endsWith("/role")) return { route: "team-role", parts };
  if (urlPath.endsWith("/context")) return { route: "context", parts };

  return null;
}
