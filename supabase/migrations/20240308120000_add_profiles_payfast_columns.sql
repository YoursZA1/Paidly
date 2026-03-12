-- Add PayFast subscription columns to profiles for ITN webhook (payfast-itn Edge Function)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payfast_token text,
  ADD COLUMN IF NOT EXISTS subscription_status text;
