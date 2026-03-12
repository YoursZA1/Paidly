/**
 * PayFast signature verification for ITN payloads.
 * Matches server logic: sort params, build key=value&..., append passphrase, MD5.
 */
// @deno-types="https://esm.sh/v135/md5@2.3.0"
import md5 from "https://esm.sh/md5@2.3.0";

function serializeParams(params: Record<string, string>): string {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export function verifyPayfastSignature(payload: Record<string, string>, passphrase: string): boolean {
  const received = payload?.signature;
  if (!received) return false;
  const { signature: _sig, ...rest } = payload;
  const baseString = serializeParams(rest as Record<string, string>);
  const signatureString = passphrase
    ? `${baseString}&passphrase=${encodeURIComponent(passphrase)}`
    : baseString;
  const expected = md5(signatureString) as string;
  return received === expected;
}
