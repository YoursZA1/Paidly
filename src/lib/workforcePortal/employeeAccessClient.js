import { getPublicApiBase } from "@/api/backendClient";

function endpoint(op, params = {}) {
  const base = String(getPublicApiBase() || "").replace(/\/$/, "");
  const query = new URLSearchParams({ op });
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") query.set(key, String(value));
  }
  return `${base}/api/company/employee-access?${query}`;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function requestEmployeeAccessLink(slug, email) {
  const res = await fetch(endpoint("request"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, email }),
  });
  const json = await readJson(res);
  if (!res.ok) {
    const err = new Error(json.error || "We couldn't send the link.");
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function redeemEmployeeAccessLink(token) {
  const res = await fetch(endpoint("redeem"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const json = await readJson(res);
  if (!res.ok) {
    const err = new Error(json.error || "This link has expired.");
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function fetchEmployeeAccessSession() {
  const res = await fetch(endpoint("session"), { credentials: "include", cache: "no-store" });
  if (res.status === 401) return null;
  const json = await readJson(res);
  if (!res.ok) {
    const err = new Error(json.error || "We couldn't open your employee details.");
    err.status = res.status;
    throw err;
  }
  return json;
}

export async function endEmployeeAccessSession() {
  await fetch(endpoint("end"), { method: "POST", credentials: "include" });
}

async function postAccess(op, body) {
  const res = await fetch(endpoint(op), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const json = await readJson(res);
  if (!res.ok) {
    const err = new Error(json.error || "We couldn't complete that.");
    err.status = res.status;
    throw err;
  }
  return json;
}

export function applyEmployeeLeave(body) {
  return postAccess("leave", body);
}

export function previewEmployeeLeave(body) {
  return postAccess("leave-preview", body);
}

export async function downloadEmployeePayslip(id) {
  const res = await fetch(endpoint("payslip-pdf", { id }), { credentials: "include" });
  if (!res.ok) {
    const json = await readJson(res);
    const err = new Error(json.error || "We couldn't download this payslip.");
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  return { blob, filename: match?.[1] || "payslip.pdf" };
}

export async function employeeDocumentUrl(id, { preview = false } = {}) {
  const res = await fetch(endpoint("document", preview ? { id, view: "1" } : { id }), { credentials: "include" });
  const json = await readJson(res);
  if (!res.ok || !json.url) {
    const err = new Error(json.error || "We couldn't open this document.");
    err.status = res.status;
    throw err;
  }
  return json.url;
}

export async function employeeAttachmentUrl(id) {
  const res = await fetch(endpoint("attachment", { id }), { credentials: "include" });
  const json = await readJson(res);
  if (!res.ok || !json.url) {
    const err = new Error(json.error || "We couldn't open this file.");
    err.status = res.status;
    throw err;
  }
  return json.url;
}
