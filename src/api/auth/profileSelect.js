import { isAbortError, retryOnAbort } from "@/utils/retryOnAbort";
import { DEFAULT_INVOICE_TEMPLATE } from "@/utils/invoiceTemplateData";

const PROFILES_SELECT_FULL =
  "id, full_name, email, avatar_url, logo_url, pos_logo_url, company_name, company_address, phone, company_website, subscription_plan, plan, subscription_status, trial_ends_at, currency, timezone, role, user_role, invoice_template, invoice_header, document_brand_primary, document_brand_secondary, business, list_filter_prefs, reminder_settings, quote_reminder_settings, created_at, updated_at";

const PROFILES_SELECT_WITHOUT_BUSINESS =
  "id, full_name, email, avatar_url, logo_url, company_name, company_address, phone, subscription_plan, plan, subscription_status, currency, timezone, role, user_role, invoice_template, invoice_header, reminder_settings, quote_reminder_settings, created_at, updated_at";

const PROFILES_SELECT_LEGACY =
  "id, full_name, email, avatar_url, logo_url, company_name, company_address, phone, subscription_plan, plan, subscription_status, currency, timezone, role, user_role, created_at, updated_at";

const PROFILES_SELECT_MINIMAL =
  "id, full_name, email, logo_url, company_name, company_address, currency, timezone, role, user_role, created_at, updated_at";

function shouldRetryProfileSelectOnSchemaError(error) {
  const m = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  if (/jwt|permission|denied|rls|policy|unauthorized|forbidden|not found|0 rows/i.test(m)) return false;
  return /column|does not exist|schema cache|pgrst204|could not find|unknown|bad request/i.test(m);
}

/**
 * Load one profile row. Retries with fewer columns when PostgREST returns 400 (unknown column / schema drift).
 */
export async function selectProfileByUserId(supabaseClient, authUserId) {
  const attempts = [
    PROFILES_SELECT_FULL,
    PROFILES_SELECT_WITHOUT_BUSINESS,
    PROFILES_SELECT_LEGACY,
    PROFILES_SELECT_MINIMAL,
  ];
  let last = null;
  for (const cols of attempts) {
    const result = await retryOnAbort(async () => {
      const r = await supabaseClient.from("profiles").select(cols).eq("id", authUserId).maybeSingle();
      if (r.error && isAbortError(r.error)) {
        throw r.error;
      }
      return r;
    }, 2, 350);
    last = result;
    if (!result.error) {
      const d = result.data ? { ...result.data } : null;
      if (d) {
        if (d.business === undefined) d.business = null;
        if (d.invoice_template === undefined) d.invoice_template = DEFAULT_INVOICE_TEMPLATE;
        if (d.invoice_header === undefined) d.invoice_header = "";
        if (d.document_brand_primary === undefined) d.document_brand_primary = null;
        if (d.document_brand_secondary === undefined) d.document_brand_secondary = null;
        if (d.phone === undefined) d.phone = null;
        if (d.company_website === undefined) d.company_website = null;
        if (d.subscription_plan === undefined) d.subscription_plan = null;
        if (d.plan === undefined) d.plan = null;
        if (d.subscription_status === undefined) d.subscription_status = null;
        if (d.trial_ends_at === undefined) d.trial_ends_at = null;
        if (d.pos_logo_url === undefined) d.pos_logo_url = null;
        if (d.avatar_url === undefined) d.avatar_url = null;
        if (d.role === undefined) d.role = null;
        if (d.user_role === undefined) d.user_role = null;
        if (d.list_filter_prefs === undefined) d.list_filter_prefs = null;
        if (d.reminder_settings === undefined) d.reminder_settings = null;
        if (d.quote_reminder_settings === undefined) d.quote_reminder_settings = null;
      }
      return { data: d, error: null };
    }
    if (!shouldRetryProfileSelectOnSchemaError(result.error)) {
      return result;
    }
  }
  return last;
}
