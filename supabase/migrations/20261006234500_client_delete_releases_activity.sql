-- Deleting a client must succeed.
-- document_events stay (the client link is cleared by ON DELETE SET NULL).
-- client_relationship_events and notes belong to the client and leave with them.
-- A direct edit or delete of an event row is still rejected.

CREATE OR REPLACE FUNCTION public.document_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND public.paidly_demo_purge_allows(OLD.org_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- ON DELETE SET NULL from public.clients. Nothing else on the event may change.
  IF TG_OP = 'UPDATE'
     AND OLD.client_id IS NOT NULL
     AND NEW.client_id IS NULL
     AND (to_jsonb(NEW) - 'client_id') = (to_jsonb(OLD) - 'client_id')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'document_events are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.client_relationship_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') AND public.paidly_demo_purge_allows(OLD.org_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Cascades from deleting the client (row) or a client note (note_id cleared).
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.note_id IS NULL
       AND (to_jsonb(NEW) - 'note_id') = (to_jsonb(OLD) - 'note_id')
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'client_relationship_events are immutable';
END;
$$;
