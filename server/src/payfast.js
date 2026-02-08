import crypto from "crypto";

const serializeParams = (params) => {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
};

export const signPayfastPayload = (params, passphrase) => {
  const baseString = serializeParams(params);
  const signatureString = passphrase
    ? `${baseString}&passphrase=${encodeURIComponent(passphrase)}`
    : baseString;

  return crypto.createHash("md5").update(signatureString).digest("hex");
};

export const verifyPayfastSignature = (payload, passphrase) => {
  if (!payload?.signature) return false;
  const { signature, ...rest } = payload;
  const expected = signPayfastPayload(rest, passphrase);
  return signature === expected;
};

export const getPayfastProcessUrl = (mode) => {
  return mode === "live"
    ? "https://www.payfast.co.za/eng/process"
    : "https://sandbox.payfast.co.za/eng/process";
};

export const getPayfastFrequency = (billingCycle) => {
  switch (billingCycle) {
    case "annual":
      return 6; // annually
    case "quarterly":
      return 4; // quarterly
    case "biannual":
      return 5; // biannual
    case "monthly":
    default:
      return 3; // monthly
  }
};
