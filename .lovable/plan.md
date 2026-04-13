

# Private Tagging System for Transcripts — Revised

## Schema

### `tags`

```text
tags
├── id               uuid  PK  default gen_random_uuid()
├── user_id          uuid  NOT NULL  (references auth.users on delete cascade)
├── name             text  NOT NULL  (display value, as entered)
├── normalized_name  text  NOT NULL  (trim + lowercase + collapse whitespace)
├── source           text  NOT NULL  default 'user'  CHECK (source IN ('user','ai'))
├── color            text  NULL      (hex or token for future chip rendering)
├── created_at       timestamptz  default now()
└── UNIQUE(user_id, normalized_name)
```

A before-insert/update trigger sets `normalized_name = lower(regexp_replace(trim(NEW.name), '\s+', ' ', 'g'))`.

### `job_tags`

Pure join table — no metadata beyond the assignment.

```text
job_tags
├── id          uuid  PK  default gen_random_uuid()
├── job_id      uuid  NOT NULL  (references jobs(id) on delete cascade)
├── tag_id      uuid  NOT NULL  (references tags(id) on delete cascade)
├── created_at  timestamptz  default now()
└── UNIQUE(job_id, tag_id)
```

## RLS Policies

### `tags`

| Policy | Command | Expression |
|--------|---------|------------|
| View own tags | SELECT | `auth.uid() = user_id` |
| Insert own tags | INSERT | `auth.uid() = user_id` |
| Update own tags | UPDATE | `auth.uid() = user_id` (USING + WITH CHECK) |
| Delete own tags | DELETE | `auth.uid() = user_id` |

### `job_tags`

| Policy | Command | Expression |
|--------|---------|------------|
| View own job tags | SELECT | `EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_id AND jobs.user_id = auth.uid()) AND EXISTS (SELECT 1 FROM tags WHERE tags.id = tag_id AND tags.user_id = auth.uid())` |
| Insert own job tags | INSERT (WITH CHECK) | same dual-ownership check |
| Delete own job tags | DELETE | same dual-ownership check |

No UPDATE policy — reassign by delete + insert.

## Indexes

Created explicitly (beyond what unique constraints provide):

- `tags(user_id, normalized_name)` — covered by the unique constraint
- `job_tags(job_id, tag_id)` — covered by the unique constraint
- `job_tags(tag_id, job_id)` — additional index for "find all jobs with tag X"

## Normalization Trigger

```sql
CREATE OR REPLACE FUNCTION normalize_tag_name()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.normalized_name := lower(regexp_replace(trim(NEW.name), '\s+', ' ', 'g'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_tag_name
  BEFORE INSERT OR UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION normalize_tag_name();
```

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Tag leakage | Dual-ownership RLS on `job_tags`; single-owner RLS on `tags` |
| Near-duplicates | `normalized_name` + unique constraint |
| Performance on filter queries | Explicit indexes on both directions of `job_tags` |
| AI duplicate inserts | Edge function uses `INSERT ... ON CONFLICT (user_id, normalized_name) DO NOTHING` |
| Orphaned tags | Acceptable — user can delete manually later |

## Migration Summary

Single migration file:
1. Create `tags` table with columns, unique constraint, RLS, 4 policies
2. Create normalization trigger
3. Create `job_tags` table with unique constraint, RLS, 3 policies
4. Create `job_tags(tag_id, job_id)` index

No existing tables modified. Fully additive.

