# Affiliate Dashboard Bug Investigation

## Bug Summary

The affiliate dashboard fails completely when the Node API is unreachable, even though a fully implemented Supabase fallback exists. The error handling in `fetchAffiliateDashboardData()` is incomplete, causing users to see "API unreachable" messages instead of gracefully falling back to Supabase.

The developers even marked this issue in the code: **"MUST FIX CONFIG (no fallback)"** (line 298 in `affiliateClient.js`)

## Root Cause Analysis

**File:** `/Users/armandomavelele/Documents/Paidly/src/api/affiliateClient.js`

**Problem Location:** Lines 258-301 in `fetchAffiliateDashboardData()`

**Issue:**
1. The function attempts to fetch affiliate dashboard data from the Node API (lines 271-296)
2. If the API call fails for ANY reason (network error, API down, misconfigured URL), it immediately returns an error (line 299)
3. A complete, working fallback implementation exists in `fetchAffiliateDashboardFromSupabase()` (lines 181-252) but is **never called**
4. The function logs: `"[affiliate] API call failed — MUST FIX CONFIG (no fallback):"` - explicitly acknowledging the missing fallback

**Why This Matters:**
- If the Node API is temporarily unreachable or misconfigured, the entire affiliate dashboard becomes unusable
- The fallback mechanism is already implemented and tested but not integrated
- Users cannot access their affiliate data even though the data is available in Supabase

## Affected Components

- **Primary:** `src/api/affiliateClient.js` - `fetchAffiliateDashboardData()` function
- **Dependent:** `src/pages/AffiliateDashboard.jsx` - uses `fetchAffiliateDashboardData()` to load dashboard
- **State:** `src/stores/useAffiliateDashboardStore.js` - calls `fetchAffiliateDashboardData()` in `fetchDashboard()` action

## Proposed Solution

Implement a fallback mechanism in `fetchAffiliateDashboardData()`:

1. **Try API first** (current behavior) - attempt to fetch from Node API
2. **Catch API errors** - if the API call fails, log the error but don't return immediately
3. **Fall back to Supabase** - call `fetchAffiliateDashboardFromSupabase()` as a backup
4. **Return Supabase data** - use the Supabase implementation if API is unavailable
5. **Preserve caching/state** - ensure both paths return the same data structure

**Implementation Details:**
- Wrap the API fetch in a try-catch block
- On error, call `fetchAffiliateDashboardFromSupabase()` instead of returning early
- Both functions return the same data structure: `{ ok, affiliate, stats, recentCommissions, ... }`
- Ensure both code paths work seamlessly without changing the consumer interface
