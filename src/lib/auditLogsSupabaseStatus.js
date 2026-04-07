/** Set while loading audit logs when `public.audit_logs` is missing (migrations not applied). */

let supabaseTableMissing = false;
let supabaseAccessForbidden = false;
let auditLogsForbiddenBreadcrumbShown = false;

export function resetAuditLogsSupabaseTableFlag() {
  supabaseTableMissing = false;
}

export function markAuditLogsSupabaseTableMissing() {
  supabaseTableMissing = true;
}

export function getAuditLogsSupabaseTableMissing() {
  return supabaseTableMissing;
}

export function markAuditLogsSupabaseAccessForbidden() {
  supabaseAccessForbidden = true;
  if (!auditLogsForbiddenBreadcrumbShown && import.meta.env?.DEV) {
    auditLogsForbiddenBreadcrumbShown = true;
    console.info(
      '[dev breadcrumb] audit_logs fallback active: Supabase denied access (42501). Using local/unified audit sources for this session.'
    );
  }
}

export function getAuditLogsSupabaseAccessForbidden() {
  return supabaseAccessForbidden;
}
