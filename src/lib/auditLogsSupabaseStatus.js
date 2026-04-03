/** Set while loading audit logs when `public.audit_logs` is missing (migrations not applied). */

let supabaseTableMissing = false;

export function resetAuditLogsSupabaseTableFlag() {
  supabaseTableMissing = false;
}

export function markAuditLogsSupabaseTableMissing() {
  supabaseTableMissing = true;
}

export function getAuditLogsSupabaseTableMissing() {
  return supabaseTableMissing;
}
