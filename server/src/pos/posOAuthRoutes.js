import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { getUserFromRequest } from "../supabaseAuth.js";
import {
  loadCompanyMembership,
  companyRoleHasPermission,
  PERMISSIONS,
} from "../companyRouteAccess.js";
import { createPosOAuthState, consumePosOAuthState } from "./posOAuthState.js";
import {
  buildSquareAuthorizeUrl,
  exchangeSquareAuthorizationCode,
  ensureSquareAppWebhookSubscription,
  isSquareOAuthConfigured,
  getSquareOAuthRedirectUri,
} from "./squareOAuth.js";
import { encryptPosSecret } from "./posSecretCrypto.js";
import { completeYocoConnect } from "./yocoConnect.js";

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function settingsRedirectUrl(query = {}) {
  const origin =
    (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).split(",")[0]?.trim()) ||
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    "https://www.paidly.co.za";
  const params = new URLSearchParams({ tab: "integrations", ...query });
  return `${String(origin).replace(/\/$/, "")}/Settings?${params.toString()}`;
}

async function requireSettingsManager(req, res) {
  const { user, error: authErr } = await getUserFromRequest(req);
  if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };

  const membership = await loadCompanyMembership(supabaseAdmin, user.id);
  if (!membership) {
    return { ok: false, response: jsonError(res, 403, "No company membership") };
  }
  if (!companyRoleHasPermission(membership.companyRole, PERMISSIONS.MANAGE_COMPANY_SETTINGS)) {
    return { ok: false, response: jsonError(res, 403, "Forbidden — company settings permission required") };
  }

  return { ok: true, user, membership };
}

export async function handleSquareOAuthStart(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  if (!isSquareOAuthConfigured()) {
    return jsonError(
      res,
      503,
      "Square OAuth is not configured. Set SQUARE_APPLICATION_ID and SQUARE_APPLICATION_SECRET."
    );
  }

  try {
    const { stateToken } = await createPosOAuthState({
      orgId: gate.membership.orgId,
      userId: gate.user.id,
      provider: "square",
    });

    const authorizeUrl = buildSquareAuthorizeUrl(stateToken);
    return res.status(200).json({ authorize_url: authorizeUrl });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not start Square OAuth");
  }
}

export async function handleSquareOAuthCallback(req, res) {
  const code = String(req.query?.code || "").trim();
  const state = String(req.query?.state || "").trim();
  const oauthError = req.query?.error;

  if (oauthError) {
    return res.redirect(302, settingsRedirectUrl({ pos_error: String(oauthError) }));
  }

  if (!code || !state) {
    return res.redirect(302, settingsRedirectUrl({ pos_error: "missing_code_or_state" }));
  }

  try {
    const oauthState = await consumePosOAuthState(state, "square");
    if (!oauthState) {
      return res.redirect(302, settingsRedirectUrl({ pos_error: "invalid_or_expired_state" }));
    }

    const tokens = await exchangeSquareAuthorizationCode(code);
    await ensureSquareAppWebhookSubscription().catch((err) => {
      console.warn("[square-oauth] webhook subscription ensure failed", err?.message || err);
    });

    const webhookToken = crypto.randomBytes(24).toString("hex");
    const webhookSecret = crypto.randomBytes(32).toString("hex");

    const { data: existing } = await supabaseAdmin
      .from("pos_connections")
      .select("id, config")
      .eq("org_id", oauthState.org_id)
      .eq("provider", "square");

    const existingMatch = (existing || []).find(
      (row) => String(row.config?.square_merchant_id || "") === String(tokens.merchantId)
    );

    const connectionPayload = {
      org_id: oauthState.org_id,
      provider: "square",
      label: "Square POS",
      webhook_token: webhookToken,
      webhook_secret: webhookSecret,
      status: "active",
      created_by: oauthState.user_id,
      config: {
        auth_type: "oauth",
        connection_method: "oauth_connect",
        square_merchant_id: tokens.merchantId,
        square_access_token_enc: encryptPosSecret(tokens.accessToken),
        square_refresh_token_enc: encryptPosSecret(tokens.refreshToken),
        square_token_expires_at: tokens.expiresAt,
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    };

    if (existingMatch?.id) {
      const { error } = await supabaseAdmin
        .from("pos_connections")
        .update(connectionPayload)
        .eq("id", existingMatch.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("pos_connections").insert(connectionPayload);
      if (error) throw error;
    }

    return res.redirect(302, settingsRedirectUrl({ pos_connected: "square" }));
  } catch (err) {
    console.error("[square-oauth] callback failed", err?.message || err);
    return res.redirect(302, settingsRedirectUrl({ pos_error: "square_connect_failed" }));
  }
}

export async function handleYocoConnect(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;

  const apiKey = String(req.body?.api_secret_key || req.body?.api_key || "").trim();
  if (!apiKey) {
    return jsonError(res, 400, "Yoco API secret key is required");
  }

  const label = String(req.body?.label || "").trim() || "Yoco POS";
  const webhookToken = crypto.randomBytes(24).toString("hex");

  try {
    const yocoFields = await completeYocoConnect({
      apiKey,
      orgId: gate.membership.orgId,
      webhookToken,
      label,
    });

    const { data, error } = await supabaseAdmin
      .from("pos_connections")
      .insert({
        org_id: gate.membership.orgId,
        provider: "yoco",
        label: yocoFields.label,
        webhook_token: webhookToken,
        webhook_secret: yocoFields.webhook_secret || crypto.randomBytes(32).toString("hex"),
        status: "active",
        config: yocoFields.config,
        created_by: gate.user.id,
      })
      .select("id, provider, label, status")
      .single();

    if (error) throw error;

    return res.status(201).json({
      ok: true,
      connection_id: data.id,
      message: "Yoco connected. Webhook registered automatically.",
    });
  } catch (err) {
    return jsonError(res, 400, err?.message || "Could not connect Yoco");
  }
}

export function getPosOAuthStatus() {
  return {
    square: {
      configured: isSquareOAuthConfigured(),
      redirect_uri: getSquareOAuthRedirectUri(),
    },
    yoco: {
      configured: true,
      connect_method: "api_secret_key",
    },
  };
}

export async function handlePosOAuthStatus(req, res) {
  const gate = await requireSettingsManager(req, res);
  if (!gate.ok) return gate.response;
  return res.status(200).json(getPosOAuthStatus());
}
