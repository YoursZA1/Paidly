-- Authoritative audit fields for admin control-plane reliability.
-- Adds normalized columns requested by platform governance:
-- action, actor_id, entity, metadata, created_at
-- (action + created_at already exist; we add missing fields).

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS entity text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON public.audit_logs (action);

COMMENT ON COLUMN public.audit_logs.actor_id IS 'Auth user id of actor performing the audited action.';
COMMENT ON COLUMN public.audit_logs.entity IS 'Primary entity or domain affected (e.g. settings, user, affiliate_application).';
COMMENT ON COLUMN public.audit_logs.metadata IS 'Structured event metadata for operational forensics.';
