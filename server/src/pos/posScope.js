/**
 * POS access-pass sessions (operator codes, till invites) are scoped to the till.
 * Back-office endpoints that share the org-member gate call this to refuse them server-side.
 * @returns {boolean} true when the request was refused (a response has been sent)
 */
export function refusePosPassOutsideTill(gate, res) {
  if (!gate?.posAccess) return false;
  res.status(403).json({ error: "POS access only — this is outside the till.", code: "POS_SCOPE" });
  return true;
}
