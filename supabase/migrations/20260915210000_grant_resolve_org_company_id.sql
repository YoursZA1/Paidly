-- Invoice INSERT fires trg_invoices_commercial_issuer → resolve_org_company_id.
-- PG15+ does not grant EXECUTE to PUBLIC; if the authenticated grant was lost,
-- PostgREST returns 403: permission denied for function resolve_org_company_id.
-- Re-grant the commercial write + RLS helpers used on invoice/quote insert.
-- Idempotent. Safe to re-run.

GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.resolve_org_company_id(uuid, uuid)',
    'public.enforce_commercial_document_issuer()',
    'public.next_document_number(uuid, text, text)',
    'public.is_org_member(uuid)',
    'public.is_admin()',
    'public.is_company_admin_for_org(uuid)',
    'public.is_company_manager_for_org(uuid)',
    'public.can_read_org_financial_row(uuid, uuid, uuid, uuid)',
    'public.normalize_company_role(text)',
    'public.normalize_invoice_status(text)',
    'public.normalize_quote_status(text)',
    'public.invoice_status_can_transition(text, text)',
    'public.quote_status_can_transition(text, text)',
    'public.enforce_invoice_status_machine()',
    'public.enforce_quote_status_machine()',
    'public.copy_quote_vat_mode_on_invoice_insert()',
    'public.record_commercial_document_created()',
    'public.record_platform_usage_event()',
    'public.normalize_invoices_owner_logo_url_trigger()',
    'public.enforce_invoice_source_quote_immutable()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    EXCEPTION
      WHEN undefined_function THEN
        RAISE NOTICE 'invoice write grants: skipping missing %', fn;
    END;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';
