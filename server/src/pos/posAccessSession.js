import crypto from "node:crypto";
import {
  POS_ACCESS_BEARER_PREFIX,
  POS_ACCESS_COOKIE,
  POS_ACCESS_TTL_SECONDS,
  POS_JOB_FUNCTION,
} from "../../../shared/posStaffInvite.js";
import { membershipHasPermission, normalizeCompanyRole, PERMISSIONS } from "../companyRouteAccess.js";

export { POS_ACCESS_COOKIE, POS_ACCESS_BEARER_PREFIX, POS_ACCESS_TTL_SECONDS };

export function hashPosAccessToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

export function generatePosAccessToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function parseCookieHeader(raw) {
  const out = {};
  for (const part of String(raw || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    out[key] = value;
  }
  return out;
}

/**
 * Raw POS access token from cookie or `Authorization: Bearer pos.<token>`.
 * JWTs and invite tokens are ignored.
 * @param {{ headers?: Record<string, string> }} req
 */
export function readPosAccessTokenFromRequest(req) {
  const auth = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (bearer.toLowerCase().startsWith(POS_ACCESS_BEARER_PREFIX)) {
    return bearer.slice(POS_ACCESS_BEARER_PREFIX.length).trim();
  }
  const cookies = parseCookieHeader(req?.headers?.cookie);
  return String(cookies[POS_ACCESS_COOKIE] || "").trim();
}

export function isSecureRequest(req) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (proto === "https") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

export function buildPosAccessCookie(token, { maxAgeSeconds = POS_ACCESS_TTL_SECONDS, secure = true } = {}) {
  const parts = [
    `${POS_ACCESS_COOKIE}=${encodeURIComponent(String(token || ""))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearPosAccessCookie({ secure = true } = {}) {
  return buildPosAccessCookie("", { maxAgeSeconds: 0, secure });
}

export function membershipFromPosAccessRow(row) {
  const role = normalizeCompanyRole(row?.role || "employee");
  const jobFunction =
    String(row?.job_function || POS_JOB_FUNCTION)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_") || POS_JOB_FUNCTION;
  return {
    userId: row?.user_id || null,
    companyId: row?.org_id,
    orgId: row?.org_id,
    companyRole: role,
    membershipRole: role,
    jobFunction,
    posRegisterId: row?.register_id || null,
    isOrgOwner: false,
  };
}

export function posAccessPermissions(membership) {
  return Object.values(PERMISSIONS).filter((permission) =>
    membershipHasPermission(membership, permission)
  );
}

export function publicPosAccessView(row, extras = {}) {
  const membership = membershipFromPosAccessRow(row);
  return {
    ok: true,
    scope: "pos",
    session_id: row.id,
    employee: {
      email: row.employee_email || extras.email || null,
      name: row.employee_name || extras.name || null,
      user_id: row.user_id || null,
    },
    org: {
      id: row.org_id,
      name: extras.orgName || null,
      business_type: extras.businessType || null,
    },
    register: extras.register
      ? {
          id: extras.register.id,
          name: extras.register.name || null,
          status: extras.register.status || null,
        }
      : row.register_id
        ? { id: row.register_id, name: extras.registerName || null, status: extras.registerStatus || null }
        : null,
    role: membership.companyRole,
    job_function: membership.jobFunction,
    permissions: posAccessPermissions(membership),
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    open_shift: extras.openShift || null,
  };
}
