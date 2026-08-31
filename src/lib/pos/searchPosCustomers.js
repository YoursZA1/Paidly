import { supabase } from "@/lib/supabaseClient";
import { sanitizePosCustomerQuery } from "@/lib/pos/posCustomerSearch";

/**
 * Org-scoped lookup on `public.clients` (RLS still applies).
 * Used when the till search outruns the first list page.
 */
export async function searchPosCustomers(orgId, query) {
  const q = sanitizePosCustomerQuery(query);
  if (!orgId || q.length < 2) return [];
  const pattern = `%${q}%`;
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email, phone, contact_person")
    .eq("org_id", orgId)
    .or(`name.ilike."${pattern}",email.ilike."${pattern}",phone.ilike."${pattern}",contact_person.ilike."${pattern}"`)
    .order("name", { ascending: true })
    .limit(20);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
