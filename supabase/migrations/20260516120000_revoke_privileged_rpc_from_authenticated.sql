-- Wave 1 security: privileged RPCs must not execute with end-user JWT.
-- Org bootstrap: POST /api/auth/bootstrap-user (service_role).
-- Trial expiry batch: cron → expire_all_overdue_trials() (service_role).

REVOKE EXECUTE ON FUNCTION public.bootstrap_user_organization(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_trial_if_due() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.bootstrap_user_organization(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_trial_if_due() TO service_role;

COMMENT ON FUNCTION public.bootstrap_user_organization(text) IS
  'SECURITY DEFINER org bootstrap for auth.uid(). Callable via service_role API only (not authenticated JWT).';

COMMENT ON FUNCTION public.expire_trial_if_due() IS
  'Per-user trial expiry. Callable via service_role/cron only; browser uses expire_all_overdue_trials batch.';
