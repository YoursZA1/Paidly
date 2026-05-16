import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage, alertSupabaseWriteFailure } from "@/utils/supabaseErrorUtils";
import { resolveUserRoleFromSessionAndProfile } from "@/lib/staffDashboard";
import { clearStoredAuthUser, readStoredAuthUser, writeStoredAuthUser } from "@/utils/authStorage";
import { DEFAULT_INVOICE_TEMPLATE } from "@/utils/invoiceTemplateData";
import { isAbortError, retryOnAbort } from "@/utils/retryOnAbort";
import { decideSessionAction, SESSION_DECISION } from "@/lib/sessionDecisionEngine";
import { getSessionAuthority } from "@/lib/session/sessionAuthorityRegistry";
import { beginCriticalSessionOperation, endCriticalSessionOperation } from "@/lib/sessionTimeoutControls";
import {
  getSessionWithRetry,
  getSessionDataForProfileWrite,
  isSupabaseAuthUuid,
} from "@/api/auth/authSessionHelpers.js";
import { normalizePaidlyPlan } from "@/api/auth/planNormalize.js";
import { clearOrgIdCache } from "@/api/auth/orgCache.js";
import { selectProfileByUserId } from "@/api/auth/profileSelect.js";

export class AuthManager {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.loadUserFromStorage();
  }

  loadUserFromStorage() {
    try {
      const stored = readStoredAuthUser();
      if (stored) {
        this.user = stored;
        this.isAuthenticated = !!this.user;
      }
    } catch {
      // Failed to load user from storage
    }
  }

  saveUserToStorage() {
    try {
      if (this.user) {
        writeStoredAuthUser(this.user);
      }
    } catch {
      console.warn("Failed to save user to sessionStorage");
    }
  }

  generateUserId(email) {
    // Generate a consistent user ID from email
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `user_${Math.abs(hash).toString(36)}`;
  }

  async login(credentials) {
    // Simulated login method
    const email = (credentials.email || '').trim().toLowerCase();
    // Use role from credentials (which is now always synced with Supabase)
    const userId = this.generateUserId(email);
    if (import.meta.env.DEV) {
      console.log(`👤 User login: ${email} → Database ID: ${userId}`);
    }

    let companyProfile = {};
    let supabaseUserId = null;
    let resolvedRole = credentials.role || "user";
    try {
      const { data: sessionData, error: sessionError } = await getSessionWithRetry();
      if (sessionError) {
        console.warn("Failed to get session for login:", getSupabaseErrorMessage(sessionError, "Session failed"));
      } else if (sessionData?.session?.user?.id) {
        const su = sessionData.session.user;
        supabaseUserId = su.id;
        const { data: profile, error: profileError } = await selectProfileByUserId(supabase, su.id);
        if (profileError) {
          if (!isAbortError(profileError)) {
            console.warn("Failed to load profile for login:", getSupabaseErrorMessage(profileError, "Load profile failed"));
          } else if (import.meta.env.DEV) {
            console.debug("[auth] Profile select aborted during login; role/plan may use defaults until me() refetch.");
          }
        }
        resolvedRole = resolveUserRoleFromSessionAndProfile(su, profile || {});
        if (profile) {
          companyProfile = {
            full_name: profile.full_name,
            company_name: profile.company_name,
            company_address: profile.company_address,
            currency: profile.currency,
            logo_url: profile.logo_url,
            timezone: profile.timezone,
            invoice_template: profile.invoice_template,
            invoice_header: profile.invoice_header,
            document_brand_primary: profile.document_brand_primary ?? null,
            document_brand_secondary: profile.document_brand_secondary ?? null,
            phone: profile.phone ?? null,
            company_website: profile.company_website ?? null,
            business: profile.business && typeof profile.business === "object" ? profile.business : null,
          };
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        if (import.meta.env.DEV) {
          console.debug(
            "[auth] Profile load aborted (tab refresh, Strict Mode, or parallel auth); continuing with session/credentials defaults."
          );
        }
      } else {
        console.warn("Failed to load profile from Supabase:", getSupabaseErrorMessage(error, "Load profile failed"));
      }
      // Do NOT fall back to localStorage - database is the source of truth.
      // Stale localStorage can cause profile data to appear "lost" after logout/login.
    }

    if (isSupabaseConfigured && !supabaseUserId) {
      this.isAuthenticated = false;
      this.user = null;
      const decision = decideSessionAction({
        reason: "missing-supabase-session",
        believedSignedIn: true,
        online: typeof navigator !== "undefined" ? navigator.onLine !== false : true,
      });
      if (decision.action === SESSION_DECISION.RECONNECTING) {
        getSessionAuthority()?.markReconnecting(decision.reason || "session_reconnecting");
      }
      return null;
    }

    this.isAuthenticated = true;
    this.user = {
      id: supabaseUserId || userId,
      supabase_id: supabaseUserId ?? null,
      email,
      role: resolvedRole,
      full_name: companyProfile.full_name || credentials.full_name || credentials.email?.split('@')[0] || 'User',
      display_name: companyProfile.full_name || credentials.full_name || credentials.email?.split('@')[0] || 'User',
      company_name: companyProfile.company_name || credentials.company_name || 'Company Name',
      company_address: companyProfile.company_address || credentials.company_address || '',
      currency: companyProfile.currency || credentials.currency || 'ZAR',
      logo_url: companyProfile.logo_url || '',
      timezone: companyProfile.timezone || credentials.timezone || 'UTC',
      invoice_template: companyProfile.invoice_template || DEFAULT_INVOICE_TEMPLATE,
      invoice_header: companyProfile.invoice_header || '',
      document_brand_primary: companyProfile.document_brand_primary ?? null,
      document_brand_secondary: companyProfile.document_brand_secondary ?? null,
      phone: companyProfile.phone ?? "",
      company_website: companyProfile.company_website ?? null,
      business: companyProfile.business || null,
      plan: normalizePaidlyPlan(credentials.plan) // Keep null unless explicitly set
    };
    this.saveUserToStorage();
    return this.user;
  }

  async logout() {
    this.isAuthenticated = false;
    this.user = null;
    clearStoredAuthUser();
    clearOrgIdCache();
  }

  async me() {
    // Return current user if authenticated
    if (!this.user || !this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    const rawCached = this.user.supabase_id || this.user.id;
    const cachedAuthId = isSupabaseAuthUuid(rawCached) ? rawCached : null;

    const withLocalTimeout = async (promise, ms, label) => {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        clearTimeout(timer);
      }
    };

    // getSession can block on refresh; fail fast and still merge profile using cached id.
    const GET_SESSION_MS = 12000;
    const GET_SESSION_RETRIES = 2;
    const GET_SESSION_RETRY_BACKOFF_MS = 250;
    const PROFILE_MS = 22000;
    const PROFILE_RETRIES = 2;
    const PROFILE_RETRY_BACKOFF_MS = 350;
    const warnSessionSlowOnce = (detail) => {
      if (!import.meta.env?.DEV) return;
      const now = Date.now();
      const last = this._lastMeSessionWarnAt || 0;
      // Avoid noisy duplicate logs when multiple views call me() close together.
      if (now - last < 30000) return;
      this._lastMeSessionWarnAt = now;
      console.warn(
        "me(): getSession slow or failed; continuing with cached user id for profile refresh:",
        detail
      );
    };
    const warnProfileSlowOnce = (detail) => {
      if (!import.meta.env?.DEV) return;
      const now = Date.now();
      const last = this._lastMeProfileWarnAt || 0;
      // Avoid noisy duplicate logs when multiple views call me() close together.
      if (now - last < 30000) return;
      this._lastMeProfileWarnAt = now;
      console.warn(
        "me(): profile refresh slow or failed; using cached profile data:",
        detail
      );
    };

    let authUserId = null;
    for (let attempt = 0; attempt <= GET_SESSION_RETRIES; attempt++) {
      try {
        const { data: sessionData, error: sessionError } = await withLocalTimeout(
          supabase.auth.getSession(),
          GET_SESSION_MS,
          "auth.getSession"
        );
        if (sessionError) {
          warnSessionSlowOnce(getSupabaseErrorMessage(sessionError, "Session failed"));
          break;
        }
        if (sessionData?.session?.user?.id) {
          authUserId = sessionData.session.user.id;
        }
        break;
      } catch (e) {
        const isLastAttempt = attempt >= GET_SESSION_RETRIES;
        if (!isLastAttempt) {
          await new Promise((resolve) => setTimeout(resolve, GET_SESSION_RETRY_BACKOFF_MS * (attempt + 1)));
          continue;
        }
        warnSessionSlowOnce(e?.message || e);
      }
    }

    const effectiveId = authUserId || cachedAuthId;
    if (!effectiveId) {
      return this.user;
    }

    try {
      let profile = null;
      let error = null;
      for (let attempt = 0; attempt <= PROFILE_RETRIES; attempt++) {
        try {
          const res = await retryOnAbort(
            () =>
              withLocalTimeout(
                selectProfileByUserId(supabase, effectiveId),
                PROFILE_MS,
                "profiles.select"
              ),
            1,
            250
          );
          profile = res?.data ?? null;
          error = res?.error ?? null;
          // Success, or "not found" shape with no transport error.
          if (!error) break;
        } catch (e) {
          const isLastAttempt = attempt >= PROFILE_RETRIES;
          if (!isLastAttempt) {
            await new Promise((resolve) =>
              setTimeout(resolve, PROFILE_RETRY_BACKOFF_MS * (attempt + 1))
            );
            continue;
          }
          throw e;
        }
        // Query returned error (not throw): retry a couple times for transient DB/network delays.
        if (attempt < PROFILE_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, PROFILE_RETRY_BACKOFF_MS * (attempt + 1))
          );
        }
      }
      if (error && !isAbortError(error)) {
        warnProfileSlowOnce(getSupabaseErrorMessage(error, "Load profile failed"));
      }
      if (!error && profile) {
        const normalizedProfilePlan = normalizePaidlyPlan(profile.plan);
        const normalizedProfileSubscriptionPlan = normalizePaidlyPlan(profile.subscription_plan);
        if (
          normalizedProfilePlan &&
          normalizedProfileSubscriptionPlan &&
          normalizedProfilePlan !== normalizedProfileSubscriptionPlan
        ) {
          console.error("[profile-plan-mismatch] profiles.plan and profiles.subscription_plan differ", {
            userId: effectiveId,
            plan: profile.plan,
            subscription_plan: profile.subscription_plan,
          });
        }
        // Merge Supabase profile (one row per user, id = auth.users.id) into local user
        const fullName = profile.full_name || this.user.full_name;
        const planMerged = normalizePaidlyPlan(
          profile.plan || profile.subscription_plan || this.user.plan || null
        );
        this.user = {
          ...this.user,
          id: effectiveId,
          supabase_id: effectiveId,
          full_name: fullName,
          display_name: fullName,
          email: profile.email || this.user.email,
          avatar_url: profile.avatar_url || this.user.avatar_url,
          logo_url: profile.logo_url || this.user.logo_url || '',
          company_name: profile.company_name || this.user.company_name || '',
          company_address: profile.company_address || this.user.company_address || '',
          currency: profile.currency || this.user.currency || 'USD',
          timezone: profile.timezone || this.user.timezone || 'UTC',
          invoice_template: profile.invoice_template || this.user.invoice_template || DEFAULT_INVOICE_TEMPLATE,
          invoice_header: profile.invoice_header || this.user.invoice_header || '',
          document_brand_primary: profile.document_brand_primary ?? this.user.document_brand_primary ?? null,
          document_brand_secondary: profile.document_brand_secondary ?? this.user.document_brand_secondary ?? null,
          phone: profile.phone ?? this.user.phone ?? "",
          company_website: profile.company_website ?? this.user.company_website ?? null,
          plan: planMerged,
          subscription_plan: normalizePaidlyPlan(profile.subscription_plan || profile.plan || planMerged),
          subscription_status: profile.subscription_status ?? this.user.subscription_status ?? null,
          trial_ends_at: profile.trial_ends_at ?? this.user.trial_ends_at ?? null,
          business:
            profile.business !== undefined && profile.business !== null && typeof profile.business === "object"
              ? profile.business
              : profile.business === null
                ? null
                : this.user.business ?? null,
          reminder_settings:
            profile.reminder_settings !== undefined && profile.reminder_settings !== null
              ? profile.reminder_settings
              : this.user.reminder_settings ?? null,
          quote_reminder_settings:
            profile.quote_reminder_settings !== undefined && profile.quote_reminder_settings !== null
              ? profile.quote_reminder_settings
              : this.user.quote_reminder_settings ?? null,
        };
        this.saveUserToStorage();
      } else if (!error && !profile) {
        // No profile row yet: ensure local user has correct id
        this.user = { ...this.user, id: effectiveId, supabase_id: effectiveId };
        this.saveUserToStorage();
      }
    } catch (e) {
      if (!isAbortError(e)) {
        warnProfileSlowOnce(getSupabaseErrorMessage(e, "Load profile failed"));
      }
    }
    return this.user;
  }

  async getCurrentUser() {
    return this.user;
  }

  /**
   * Restore user state from Supabase session when localStorage was cleared.
   * Loads profile from Supabase profiles table (one row per user, id = auth.users.id).
   * If optionalSession is provided, skips getSession() for faster init (single round-trip: profile only).
   * @param {object} [optionalSession] - If provided, { user } is used; avoids extra getSession() call
   * @returns {Promise<object|null>} Restored user or null
   */
  async restoreFromSupabaseSession(optionalSession = null) {
    try {
      let su = optionalSession?.user ?? null;
      if (!su) {
        const { data, error } = await getSessionWithRetry();
        if (error || !data?.session?.user) return null;
        su = data.session.user;
      }

      let profileData = {};
      try {
        const { data: profile, error: profileErr } = await retryOnAbort(
          () => selectProfileByUserId(supabase, su.id),
          2,
          250
        );
        if (profileErr && !isAbortError(profileErr)) {
          console.warn(
            "Could not load profile in restoreFromSupabaseSession:",
            getSupabaseErrorMessage(profileErr, "Profile load failed")
          );
        }
        profileData = profile || {};
      } catch (profileErr) {
        if (!isAbortError(profileErr)) {
          console.warn(
            "Could not load profile in restoreFromSupabaseSession:",
            getSupabaseErrorMessage(profileErr, "Profile load failed")
          );
        }
      }

      const fullName = profileData.full_name || su.user_metadata?.full_name || (su.email || "").split("@")[0] || "User";
      const normalizedProfilePlan = normalizePaidlyPlan(profileData.plan);
      const normalizedProfileSubscriptionPlan = normalizePaidlyPlan(profileData.subscription_plan);
      if (
        normalizedProfilePlan &&
        normalizedProfileSubscriptionPlan &&
        normalizedProfilePlan !== normalizedProfileSubscriptionPlan
      ) {
        console.error("[profile-plan-mismatch] profiles.plan and profiles.subscription_plan differ", {
          userId: su.id,
          plan: profileData.plan,
          subscription_plan: profileData.subscription_plan,
        });
      }
      const plan = normalizePaidlyPlan(
        profileData.plan || profileData.subscription_plan || su.app_metadata?.plan || null
      );
      this.user = {
        id: su.id,
        supabase_id: su.id,
        auth_id: su.id,
        email: (su.email || "").toLowerCase(),
        role: resolveUserRoleFromSessionAndProfile(su, profileData),
        full_name: fullName,
        display_name: fullName,
        company_name: profileData.company_name || "",
        company_address: profileData.company_address || "",
        currency: profileData.currency || "ZAR",
        logo_url: profileData.logo_url || "",
        timezone: profileData.timezone || "UTC",
        invoice_template: profileData.invoice_template || DEFAULT_INVOICE_TEMPLATE,
        invoice_header: profileData.invoice_header || "",
        document_brand_primary: profileData.document_brand_primary ?? null,
        document_brand_secondary: profileData.document_brand_secondary ?? null,
        phone: profileData.phone ?? "",
        company_website: profileData.company_website ?? null,
        business:
          profileData.business !== undefined && profileData.business !== null && typeof profileData.business === "object"
            ? profileData.business
            : null,
        plan,
        subscription_plan: normalizePaidlyPlan(profileData.subscription_plan || profileData.plan || plan),
        subscription_status: profileData.subscription_status ?? null,
        trial_ends_at: profileData.trial_ends_at ?? null,
        reminder_settings: profileData.reminder_settings ?? null,
        quote_reminder_settings: profileData.quote_reminder_settings ?? null,
      };
      this.isAuthenticated = true;
      this.saveUserToStorage();
      return this.user;
    } catch (err) {
      if (!isAbortError(err)) {
        console.warn("restoreFromSupabaseSession failed:", getSupabaseErrorMessage(err, "Restore failed"));
      }
      return null;
    }
  }

  /**
   * Get the current auth user id from Supabase session (used to key profile and storage per user).
   * @returns {Promise<string|null>} auth.users id or null if not authenticated
   */
  async getAuthUserId() {
    const { data } = await getSessionWithRetry();
    return data?.session?.user?.id ?? null;
  }

  /**
   * Update current user and persist to Supabase profiles table.
   * Profile is stored per user: one row per auth user, keyed by auth.users(id). Only writes when session exists.
   *
   * Billing / subscription columns must NOT be updated from the browser — only PayFast ITN (service role) or admin.
   */
  async updateMyUserData(data) {
    beginCriticalSessionOperation();
    try {
    if (!this.user) {
      this.user = {};
    }

    const billingFieldsLockedForClient = [
      "subscription_plan",
      "plan",
      "subscription_status",
      "trial_ends_at",
      "payfast_token",
      "payfast_subscription_id",
      "is_pro",
    ];
    const safeData = data && typeof data === "object" ? { ...data } : {};
    for (const k of billingFieldsLockedForClient) {
      if (Object.prototype.hasOwnProperty.call(safeData, k)) {
        if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
          console.warn(
            `[profile] Ignoring "${k}" in updateMyUserData — set only via verified PayFast webhook / server, not the client.`
          );
        }
        delete safeData[k];
      }
    }

    const { data: sessionData } = await getSessionDataForProfileWrite(this.user);
    // Same fallback as me(): avoid skipping DB writes when getSession is slow/empty but we already have the auth id.
    const rawAuth =
      sessionData?.session?.user?.id ?? this.user?.supabase_id ?? this.user?.id ?? null;
    const authUserId = isSupabaseAuthUuid(rawAuth) ? rawAuth : null;

    // Keep id as auth user id when available so all consumers get the real user id
    const updatedUser = {
      ...this.user,
      ...safeData,
      id: authUserId ?? this.user.id,
      supabase_id: authUserId ?? this.user.supabase_id,
    };
    if (safeData.business !== undefined) {
      if (safeData.business === null) {
        updatedUser.business = null;
      } else if (safeData.business && typeof safeData.business === "object") {
        const currentBusiness =
          this.user?.business && typeof this.user.business === "object" ? this.user.business : {};
        updatedUser.business = { ...currentBusiness, ...safeData.business };
      } else {
        updatedUser.business = safeData.business;
      }
    }
    this.user = updatedUser;
    this.saveUserToStorage();

    // Persist to Supabase profiles table (per-user row keyed by auth user id)
    if (!authUserId) {
      throw new Error("Not signed in — cannot save profile. Sign in again and retry.");
    }

    const profileColumnMissing = (msg, columnName) => {
      const m = String(msg || "");
      if (!m) return false;
      const esc = columnName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        `(column|field)[^a-z0-9_]*${esc}|${esc}[^a-z0-9_]*(of relation|does not exist|unknown)|schema cache[^\\n']*${esc}|'${esc}'`,
        "i"
      ).test(m);
    };

    const profileData = {
      full_name: safeData.full_name ?? safeData.display_name ?? updatedUser.full_name,
      email: safeData.email ?? updatedUser.email,
      avatar_url: safeData.avatar_url ?? updatedUser.avatar_url,
      logo_url: safeData.logo_url !== undefined ? safeData.logo_url : updatedUser.logo_url,
      company_name: safeData.company_name !== undefined ? safeData.company_name : updatedUser.company_name,
      company_address: safeData.company_address !== undefined ? safeData.company_address : updatedUser.company_address,
      phone: safeData.phone !== undefined ? safeData.phone : updatedUser.phone,
      company_website: safeData.company_website !== undefined ? safeData.company_website : updatedUser.company_website,
      currency: safeData.currency ?? updatedUser.currency ?? "USD",
      timezone: safeData.timezone ?? updatedUser.timezone ?? "UTC",
      invoice_template: safeData.invoice_template ?? updatedUser.invoice_template ?? DEFAULT_INVOICE_TEMPLATE,
      invoice_header: safeData.invoice_header !== undefined ? safeData.invoice_header : updatedUser.invoice_header,
      ...(safeData.business !== undefined ? { business: updatedUser.business } : {}),
      ...(safeData.document_brand_primary !== undefined
        ? { document_brand_primary: safeData.document_brand_primary }
        : {}),
      ...(safeData.document_brand_secondary !== undefined
        ? { document_brand_secondary: safeData.document_brand_secondary }
        : {}),
      ...(safeData.reminder_settings !== undefined
        ? { reminder_settings: safeData.reminder_settings }
        : {}),
      ...(safeData.quote_reminder_settings !== undefined
        ? { quote_reminder_settings: safeData.quote_reminder_settings }
        : {}),
      updated_at: new Date().toISOString(),
    };

    Object.keys(profileData).forEach((key) => {
      if (profileData[key] === undefined) delete profileData[key];
    });

    const upsertProfileRow = async () => {
      let { error } = await retryOnAbort(
        () =>
          supabase.from("profiles").upsert({ id: authUserId, ...profileData }, { onConflict: "id" }),
        8,
        450
      );

      const errMsg = error?.message || "";
      const stripBusiness =
        !!error && Object.prototype.hasOwnProperty.call(profileData, "business") && profileColumnMissing(errMsg, "business");
      const stripCompanyAddress =
        !!error &&
        Object.prototype.hasOwnProperty.call(profileData, "company_address") &&
        profileColumnMissing(errMsg, "company_address");
      const stripDocumentBrand =
        !!error &&
        (Object.prototype.hasOwnProperty.call(profileData, "document_brand_primary") ||
          Object.prototype.hasOwnProperty.call(profileData, "document_brand_secondary")) &&
        (profileColumnMissing(errMsg, "document_brand_primary") ||
          profileColumnMissing(errMsg, "document_brand_secondary"));
      const stripCompanyWebsite =
        !!error &&
        Object.prototype.hasOwnProperty.call(profileData, "company_website") &&
        profileColumnMissing(errMsg, "company_website");
      const stripReminderJson =
        !!error &&
        (Object.prototype.hasOwnProperty.call(profileData, "reminder_settings") ||
          Object.prototype.hasOwnProperty.call(profileData, "quote_reminder_settings")) &&
        (profileColumnMissing(errMsg, "reminder_settings") ||
          profileColumnMissing(errMsg, "quote_reminder_settings"));

      if (
        error &&
        (stripBusiness ||
          stripCompanyAddress ||
          stripDocumentBrand ||
          stripCompanyWebsite ||
          stripReminderJson)
      ) {
        const fallback = { ...profileData };
        if (stripBusiness) delete fallback.business;
        if (stripCompanyAddress) delete fallback.company_address;
        if (stripDocumentBrand) {
          delete fallback.document_brand_primary;
          delete fallback.document_brand_secondary;
        }
        if (stripCompanyWebsite) delete fallback.company_website;
        if (stripReminderJson) {
          delete fallback.reminder_settings;
          delete fallback.quote_reminder_settings;
        }
        Object.keys(fallback).forEach((key) => {
          if (fallback[key] === undefined) delete fallback[key];
        });
        const retry = await retryOnAbort(
          () => supabase.from("profiles").upsert({ id: authUserId, ...fallback }, { onConflict: "id" }),
          8,
          450
        );
        error = retry.error;
        if (!error) {
          if (stripBusiness) {
            console.warn(
              "Profile saved without business column. Run scripts/add-profiles-business-jsonb.sql on your database."
            );
          }
          if (stripCompanyAddress) {
            console.warn("Profile saved without company_address (column missing on profiles table).");
          }
          if (stripDocumentBrand) {
            console.warn(
              "Profile saved without document brand color columns. Run scripts/add-profiles-document-brand-colors.sql on your database."
            );
          }
          if (stripCompanyWebsite) {
            console.warn(
              "Profile saved without company_website column. Run scripts/add-profiles-company-website.sql on your database."
            );
          }
          if (stripReminderJson) {
            console.warn(
              "Profile saved without reminder_settings / quote_reminder_settings. Run scripts/add-profiles-reminder-settings-jsonb.sql on your database."
            );
          }
        }
      }

      if (error) {
        alertSupabaseWriteFailure(error, "Save profile failed");
        throw new Error(getSupabaseErrorMessage(error, "Save profile failed"));
      }
    };

    try {
      await upsertProfileRow();
    } catch (e) {
      if (isAbortError(e)) {
        await new Promise((r) => setTimeout(r, 900));
        try {
          await upsertProfileRow();
        } catch (e2) {
          if (isAbortError(e2)) {
            console.warn(
              "Profile sync aborted after retry (auth/network race). Local profile in this browser was updated.",
              e2
            );
            return this.user;
          }
          throw e2;
        }
      } else {
        throw e instanceof Error ? e : new Error(getSupabaseErrorMessage(e, "Save profile failed"));
      }
    }

    return this.user;
    } finally {
      endCriticalSessionOperation();
    }
  }

  isAuth() {
    return this.isAuthenticated;
  }
}
