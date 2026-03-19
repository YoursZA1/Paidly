import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Resend configuration (set these in Supabase Edge Function Secrets)
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Paidly <no-reply@paidly.co.za>";

// Supabase configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response("Server misconfigured (Supabase env missing)", {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!RESEND_API_KEY) {
      return new Response("Server misconfigured (RESEND_API_KEY missing)", {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Optional auth gate: require a Supabase JWT in Authorization: Bearer ...
    // This prevents unauthenticated abuse (otherwise anyone could spam your email provider).
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!accessToken) {
      return new Response("Unauthorized (missing access token)", { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: authError } = await supabase.auth.getUser(accessToken);
    if (authError) {
      return new Response("Unauthorized (invalid token)", { status: 401, headers: corsHeaders });
    }

    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400, headers: corsHeaders });
    }

    const pdfBase64: string | undefined = payload?.pdfBase64;
    const email: string | undefined = payload?.email;
    const subject: string | undefined = payload?.subject;
    const html: string | undefined = payload?.html;
    const filename: string | undefined = payload?.filename;

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return new Response("Missing pdfBase64", { status: 400, headers: corsHeaders });
    }
    if (!email || typeof email !== "string") {
      return new Response("Missing email", { status: 400, headers: corsHeaders });
    }
    if (!html || typeof html !== "string") {
      return new Response("Missing html", { status: 400, headers: corsHeaders });
    }

    // Safety limit: base64 string can be large; reject unexpectedly big payloads.
    // 12,000,000 chars is roughly ~9MB base64-ish; adjust if needed.
    if (pdfBase64.length > 12_000_000) {
      return new Response("pdfBase64 payload too large", { status: 413, headers: corsHeaders });
    }

    const emailSubject = subject || "Your Invoice";
    const attachmentFilename = filename || "invoice.pdf";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email,
        subject: emailSubject,
        html,
        attachments: [
          {
            filename: attachmentFilename,
            content: pdfBase64,
            contentType: "application/pdf",
          },
        ],
      }),
    });

    const resendBody = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      return new Response(JSON.stringify({ success: false, error: resendBody }), {
        status: resendRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-invoice-email] Error:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

