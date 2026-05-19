-- Revoke public/anon EXECUTE on SECURITY DEFINER helper functions.
-- service_role and authenticated calls continue to work via explicit grants.

REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_and_record_usage(uuid, text, text, uuid, text, interval, integer, integer, jsonb) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Trigger-only functions: never need direct EXECUTE from API roles.
REVOKE EXECUTE ON FUNCTION public.invalidate_tag_translation_cache() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_share_pdf_cache_path() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_tag_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_jobs_billing_columns() FROM PUBLIC, anon, authenticated;

-- get_review_aggregate intentionally remains executable by anon (public homepage).
