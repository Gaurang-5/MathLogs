CREATE OR REPLACE FUNCTION notify_whatsapp_job()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('whatsapp_job_insert', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS whatsapp_job_insert_trigger ON "WhatsappJob";

CREATE TRIGGER whatsapp_job_insert_trigger
AFTER INSERT ON "WhatsappJob"
FOR EACH ROW EXECUTE PROCEDURE notify_whatsapp_job();
