import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPayfastSignature } from "../_shared/payfast.ts";

const PAYFAST_PASSPHRASE = Deno.env.get("PAYFAST_PASSPHRASE") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1. Parse PayFast ITN (application/x-www-form-urlencoded)
    const contentType = req.headers.get("content-type") ?? "";
    let data: Record<string, string>;

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      const params = new URLSearchParams(text);
      data = Object.fromEntries([...params.entries()].map(([k, v]) => [k, String(v)])) as Record<string, string>;
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      data = Object.fromEntries(
        [...formData.entries()].map(([k, v]) => [k, v instanceof File ? v.name : String(v)])
      ) as Record<string, string>;
    } else {
      console.error("[payfast-itn] Unsupported content-type:", contentType);
      return new Response("Unsupported content-type", { status: 400 });
    }

    // 2. Only process completed payments
    const paymentStatus = (data.payment_status ?? "").toUpperCase();
    if (paymentStatus !== "COMPLETE") {
      return new Response("Not complete", { status: 200 });
    }

    // 3. Validate PayFast signature
    if (!PAYFAST_PASSPHRASE) {
      console.error("[payfast-itn] PAYFAST_PASSPHRASE is not set");
      return new Response("Server configuration error", { status: 500 });
    }
    if (!verifyPayfastSignature(data, PAYFAST_PASSPHRASE)) {
      console.error("[payfast-itn] Invalid PayFast signature");
      return new Response("Invalid signature", { status: 400 });
    }

    // 4. Profile id: custom_str1 = user UUID (subscription checkout); legacy custom_str2; or m_payment_id sub_<uuid>_<ts>
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const SUB_MPAY_RE =
      /^sub_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_\d+$/i;
    const customStr1 = (data.custom_str1 ?? "").trim();
    const customStr2 = (data.custom_str2 ?? "").trim();
    const mPaymentId = (data.m_payment_id ?? "").trim();
    let profileId = UUID_RE.test(customStr1) ? customStr1 : "";
    if (!profileId && UUID_RE.test(customStr2)) profileId = customStr2;
    if (!profileId && mPaymentId) {
      const m = SUB_MPAY_RE.exec(mPaymentId);
      if (m?.[1] && UUID_RE.test(m[1])) profileId = m[1];
    }
    if (!profileId && UUID_RE.test(mPaymentId)) profileId = mPaymentId;
    if (!profileId) {
      console.error("[payfast-itn] No profile id in custom_str1, custom_str2, or m_payment_id", {
        m_payment_id: mPaymentId,
        custom_str1: customStr1,
        custom_str2: customStr2,
      });
      return new Response("Missing payment id", { status: 400 });
    }

    // 5. Map PayFast item_name / custom_str2 → profiles.plan slug (align with server/src/payfastSubscriptionItn.js)
    const mapPayfastPlanToProfilePlan = (itemName: string) => {
      const t = String(itemName || "")
        .toLowerCase()
        .replace(/\s+plan$/i, "");
      if (t.includes("corporate") || t.includes("enterprise")) return "corporate";
      if (t.includes("sme") || t.includes("professional") || t.includes("business")) return "sme";
      if (t.includes("individual") || t.includes("starter") || t.includes("solo")) return "individual";
      return "individual";
    };
    const planLabel = String(data.item_name ?? data.custom_str2 ?? "")
      .replace(/\s+plan$/i, "")
      .trim();
    const profilePlan = mapPayfastPlanToProfilePlan(planLabel);

    // 6. Supabase Admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 7. Update profiles (webhook — same intent as Node `upsertSubscriptionFromItn` profile sync)
    const token = (data.token ?? "").trim();
    const { error } = await supabase
      .from("profiles")
      .update({
        plan: profilePlan,
        subscription_plan: profilePlan,
        subscription_status: "active",
        trial_ends_at: null,
        is_pro: true,
        ...(token ? { payfast_token: token } : {}),
      })
      .eq("id", profileId);

    if (error) {
      console.error("[payfast-itn] Profile update failed", { profileId, error: error.message });
      return new Response(`Update failed: ${error.message}`, { status: 400 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[payfast-itn] Error", message);
    return new Response(message, { status: 400 });
  }
});
