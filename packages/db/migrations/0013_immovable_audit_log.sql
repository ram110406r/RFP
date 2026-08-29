CREATE OR REPLACE FUNCTION "audit_logs_block_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('rfp_os.audit_mutation_override', true) = 'on' OR pg_trigger_depth() > 1 THEN
    IF TG_OP = 'UPDATE' AND NEW IS DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs is append-only';
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "audit_logs_immutable_update" ON "audit_logs";--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_logs_immutable_delete" ON "audit_logs";--> statement-breakpoint

CREATE TRIGGER "audit_logs_immutable_update"
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "audit_logs_block_mutation"();--> statement-breakpoint

CREATE TRIGGER "audit_logs_immutable_delete"
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION "audit_logs_block_mutation"();
