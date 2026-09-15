// @ts-check

export function normalizeLeaveRows(rows = []) {
  let parsed = rows;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed : [];
}

export function leaveRowsByProfile(rows = []) {
  const map = new Map();
  for (const row of normalizeLeaveRows(rows)) {
    const id = row?.payroll_profile_id;
    if (!id) continue;
    const list = map.get(id) || [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

export function shouldRetryCalculateWithoutReclaim(err, attempt) {
  return err?.code === "LEAVE_CHANGED" && attempt === 0;
}

export function restoreStatusAfterFailedCalculate(previousStatus, calculatedAt) {
  const status = String(previousStatus || "");
  if (status && status !== "processing" && status !== "cancelled" && status !== "paid") {
    return status;
  }
  return calculatedAt ? "calculated" : "draft";
}

export function isMissingLockRpc(error) {
  const msg = String(error?.message || error?.code || "");
  const code = String(error?.code || "").toUpperCase();
  return (
    code === "PGRST202" ||
    /could not find the function|function .* does not exist|schema cache/i.test(msg)
  );
}

export function mapPayRunLockResult(data, error) {
  if (error) {
    if (isMissingLockRpc(error)) return { fallback: true };
    const err = new Error(error.message || "Pay run lock failed");
    err.status = 500;
    throw err;
  }
  if (data?.ok === true) return data;
  const code = data?.code || data?.error;
  if (data?.ok === false || code) {
    const err = new Error(
      code === "PAY_RUN_BUSY"
        ? "Payroll is already calculating. Try again in a moment."
        : code === "LEAVE_CHANGED"
          ? "Leave changed during calculation. Retrying."
          : data?.message || "Pay run lock failed"
    );
    err.status = code === "NOT_FOUND" ? 404 : 409;
    err.code = code || "PAY_RUN_LOCK";
    err.leaveFingerprint = data?.leave_fingerprint || null;
    throw err;
  }
  return data || {};
}
