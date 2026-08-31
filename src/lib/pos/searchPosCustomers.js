import { supabase } from "@/lib/supabaseClient";
import { POS_CUSTOMER_SELECT, sanitizePosCustomerQuery } from "@/lib/pos/posCustomerSearch";

function mapPosCustomerRows(data) {
  return (Array.isArray(data) ? data : []).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone || null,
    pos_enabled: true,
  }));
}

/**
 * POS-accessible customers only (`pos_enabled`). RLS also hides general clients from POS-only staff.
 * Does not select email or other CRM fields.
 */
export async function listPosCustomers(orgId, { query = "", limit = 20 } = {}) {
  if (!orgId) return [];
  const q = sanitizePosCustomerQuery(query);
  let request = supabase
    .from("clients")
    .select(POS_CUSTOMER_SELECT)
    .eq("org_id", orgId)
    .eq("pos_enabled", true)
    .order("name", { ascending: true })
    .limit(limit);
  if (q.length >= 2) {
    const pattern = `%${q}%`;
    request = request.or(`name.ilike."${pattern}",phone.ilike."${pattern}"`);
  }
  const { data, error } = await request;
  if (error) throw error;
  return mapPosCustomerRows(data);
}

export async function searchPosCustomers(orgId, query) {
  const q = sanitizePosCustomerQuery(query);
  if (!orgId || q.length < 2) return [];
  return listPosCustomers(orgId, { query: q, limit: 20 });
}
