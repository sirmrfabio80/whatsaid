create table public.help_faq_feedback (
  id uuid primary key default gen_random_uuid(),
  faq_anchor text not null,
  helpful boolean not null,
  locale text not null,
  user_id uuid null,
  created_at timestamptz not null default now()
);

create index help_faq_feedback_anchor_idx on public.help_faq_feedback (faq_anchor);
create index help_faq_feedback_created_at_idx on public.help_faq_feedback (created_at desc);

alter table public.help_faq_feedback enable row level security;

-- Anyone (anon + authenticated) may submit feedback
create policy "Anyone can submit FAQ feedback"
on public.help_faq_feedback
for insert
to anon, authenticated
with check (true);

-- Only admins may read collected feedback
create policy "Admins can read FAQ feedback"
on public.help_faq_feedback
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));