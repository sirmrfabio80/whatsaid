-- Tighten the public-insert policy: validate shape so anonymous submitters
-- can only insert well-formed telemetry rows (no arbitrary text payloads).
drop policy "Anyone can submit FAQ feedback" on public.help_faq_feedback;

create policy "Anyone can submit well-formed FAQ feedback"
on public.help_faq_feedback
for insert
to anon, authenticated
with check (
  faq_anchor ~ '^faq-[a-z0-9-]{1,80}$'
  and locale in ('en', 'it', 'fr')
  and length(faq_anchor) <= 100
);