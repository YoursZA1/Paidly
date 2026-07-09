import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function resolveEncryptionKey() {
  const raw =
    process.env.POS_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.POS_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) return null;
  return crypto.createHash("sha256").update(String(raw)).digest();
}

/**
 * @param {string} plaintext
 * @returns {string|null}
 */
export function encryptPosSecret(plaintext) {
  const key = resolveEncryptionKey();
  if (!key || plaintext == null) return null;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

/**
 * @param {string|null|undefined} payload
 * @returns {string|null}
 */
export function decryptPosSecret(payload) {
  const key = resolveEncryptionKey();
  if (!key || !payload) return null;
  const parts = String(payload).split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(parts[3], "base64url");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecret(value, visible = 4) {
  const s = String(value || "");
  if (s.length <= visible * 2) return "••••••••";
  return `${s.slice(0, visible)}••••${s.slice(-visible)}`;
}
