import { createHash, randomInt } from "node:crypto";
import {
  POS_TILL_INVITE_ALPHABET,
  POS_TILL_INVITE_CODE_LENGTH,
  formatPosTillInviteCode,
  normalizePosTillInviteCode,
} from "../../../shared/posTillInviteCode.js";

export {
  POS_TILL_INVITE_ALPHABET,
  POS_TILL_INVITE_CODE_LENGTH,
  formatPosTillInviteCode,
  normalizePosTillInviteCode,
} from "../../../shared/posTillInviteCode.js";

/**
 * Cryptographically random 8-char till code, formatted XXXX-XXXX.
 * Never sequential. Not a database id.
 */
export function generatePosTillInviteCode() {
  let raw = "";
  for (let i = 0; i < POS_TILL_INVITE_CODE_LENGTH; i += 1) {
    raw += POS_TILL_INVITE_ALPHABET[randomInt(POS_TILL_INVITE_ALPHABET.length)];
  }
  return formatPosTillInviteCode(raw);
}

/** SHA-256 hex of the normalized code. Store this; never persist the raw code. */
export function hashPosTillInviteCode(raw) {
  const normalized = normalizePosTillInviteCode(raw);
  if (!normalized) return "";
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
