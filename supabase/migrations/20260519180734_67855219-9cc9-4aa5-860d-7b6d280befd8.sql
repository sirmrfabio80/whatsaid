REVOKE EXECUTE ON FUNCTION public.add_credits(uuid, integer, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, integer, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_record_usage(uuid, text, text, uuid, text, interval, integer, integer, jsonb) FROM authenticated;
