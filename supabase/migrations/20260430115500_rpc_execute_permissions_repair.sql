-- Repair RPC execute grants for browser-authenticated callers.
-- This migration is idempotent and safe to run repeatedly.

GRANT USAGE ON SCHEMA public TO authenticated;

-- Org bootstrap RPC used by app initialization.
GRANT EXECUTE ON FUNCTION public.bootstrap_user_organization(text) TO authenticated;

-- Trial expiry RPC used during profile/session hydration.
GRANT EXECUTE ON FUNCTION public.expire_trial_if_due() TO authenticated;

