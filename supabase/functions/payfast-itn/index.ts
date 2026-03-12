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

    // 4. Resolve profile id: custom_str2 is userId from our server; fallback to m_payment_id if it looks like a UUID
    const customStr2 = (data.custom_str2 ?? "").trim();
    const mPaymentId = (data.m_payment_id ?? "").trim();
    const profileId = customStr2 || mPaymentId;
    if (!profileId) {
      console.error("[payfast-itn] No profile id in m_payment_id or custom_str2", { m_payment_id: mPaymentId, custom_str2: customStr2 });
      return new Response("Missing payment id", { status: 400 });
    }

    // 5. Supabase Admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 6. Update profiles: is_pro, payfast_token (for recurring), subscription_status
    const token = (data.token ?? "").trim();
    const { error } = await supabase
      .from("profiles")
      .update({
        is_pro: true,
        ...(token ? { payfast_token: token } : {}),
        subscription_status: "active",
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
