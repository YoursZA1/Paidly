import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const signature = req.headers.get("x-webhook-signature");
  const expected = Deno.env.get("BILLING_WEBHOOK_SECRET");

  if (!expected || signature !== expected) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch (error) {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  // TODO: Map gateway payload to invoices/payments updates.
  return new Response(JSON.stringify({ ok: true, received: payload }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
