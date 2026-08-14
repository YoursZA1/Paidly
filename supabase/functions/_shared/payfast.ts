/**
 * PayFast ITN signature verification.
 * Matches Node `verifyPayFastITNSignature`: received order, PHP urlencode, optional passphrase.
 * Do not alphabetically sort — that is the REST API signature format.
 */
// @deno-types="https://esm.sh/v135/md5@2.3.0"
import md5 from "https://esm.sh/md5@2.3.0";

function phpUrlEncode(value: string): string {
  return encodeURIComponent(String(value))
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function verifyPayfastSignature(payload: Record<string, string>, passphrase: string): boolean {
  const received = String(payload?.signature || "").trim().toLowerCase();
  if (!received || !/^[a-f0-9]{32}$/.test(received)) return false;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (key === "signature") continue;
    if (value == null) continue;
    parts.push(`${key}=${phpUrlEncode(String(value))}`);
  }
  let paramString = parts.join("&");
  const pass = String(passphrase || "").trim();
  if (pass) {
    paramString += `&passphrase=${phpUrlEncode(pass)}`;
  }
  const expected = String(md5(paramString) as string).toLowerCase();
  return received === expected;
}
