-- OAuth state tokens for POS connect flows (Square OAuth, short-lived CSRF protection).

CREATE TABLE IF NOT EXISTS public.pos_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('square', 'yoco')),
  state_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_oauth_states_expires_at ON public.pos_oauth_states(expires_at);

ALTER TABLE public.pos_oauth_states ENABLE ROW LEVEL SECURITY;

-- No client policies — service role only.

COMMENT ON TABLE public.pos_oauth_states IS
  'One-time OAuth CSRF state for POS provider connect flows. Consumed on callback.';
