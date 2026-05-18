import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AssetService from "@/services/AssetService";
import { resolveProfileLogoUrl } from "@/lib/profileLogo";

/**
 * Resolves the current organisation's branding data in priority order:
 *
 *   1. profile.logo_url / profile.company_logo_url  (fresh profile row — fullest data)
 *   2. user.logo_url / user.company_logo_url         (auth session user — may be minimal on cold load)
 *   3. auth user_metadata.*                          (set by some third-party OAuth providers)
 *
 * `profile` and `user` come from the same AuthContext; `profile` is preferred because the
 * auth session user can be a trimmed "minimal" snapshot during initial hydration, whereas
 * `profile` is always the full profiles-table row once auth has settled.
 *
 * Returns:
 *   - `logoPath`   – raw value stored in the profile (short path or full URL); null if absent
 *   - `logoUrl`    – fully resolved public URL via AssetService; null if absent / failed
 *   - `initials`   – one-or-two character fallback derived from company/user name
 *   - `companyName` – display name for the organisation
 *   - `hasLogo`    – true when a resolvable logo URL exists
 */
export function useCompanyBrand() {
  const { user, profile } = useAuth();

  return useMemo(() => {
    // Prefer the full profile row; fall back to the session user for backwards compatibility.
    const source = profile || user;

    const companyName =
      source?.company_name ||
      source?.full_name ||
      user?.user_metadata?.company_name ||
      "My Business";

    const rawPath =
      resolveProfileLogoUrl(source) ||
      // Also check the auth-session user in case profile is still loading.
      resolveProfileLogoUrl(user) ||
      user?.user_metadata?.company_logo_url ||
      user?.user_metadata?.avatar_url ||
      null;

    let logoUrl = null;
    if (rawPath) {
      const resolved = AssetService.getLogo(rawPath);
      // getLogo returns FALLBACK_LOGO when the path is invalid or the asset is known-failed.
      if (resolved && resolved !== AssetService.FALLBACK_LOGO) {
        logoUrl = resolved;
      }
    }

    const initials = (() => {
      const words = companyName.trim().split(/\s+/);
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return (words[0]?.[0] ?? "?").toUpperCase();
    })();

    return {
      logoPath: rawPath,
      logoUrl,
      initials,
      companyName,
      hasLogo: Boolean(logoUrl),
    };
  }, [user, profile]);
}
