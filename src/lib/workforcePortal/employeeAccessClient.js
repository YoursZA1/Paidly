import { getPublicApiBase } from "@/api/backendClient";

function endpoint(op) {
  const base = String(getPublicApiBase() || "").replace(/\/$/, "");
  return `${base}/api/company/employee-access?op=${encodeURIComponent(op)}`;
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
