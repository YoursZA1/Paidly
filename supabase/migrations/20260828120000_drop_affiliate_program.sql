-- Remove the Affiliate program: tables, RPCs, and leftover admin settings.

DROP FUNCTION IF EXISTS public.submit_affiliate_application(text, text, text, text);
DROP FUNCTION IF EXISTS public.record_referral_signup(text, uuid);
DROP FUNCTION IF EXISTS public.record_affiliate_click(text);

DROP TABLE IF EXISTS public.commissions CASCADE;
DROP TABLE IF EXISTS public.affiliate_clicks CASCADE;
DROP TABLE IF EXISTS public.referrals CASCADE;
DROP TABLE IF EXISTS public.affiliates CASCADE;
DROP TABLE IF EXISTS public.affiliate_applications CASCADE;

DELETE FROM public.admin_settings WHERE key = 'affiliateProgram';
