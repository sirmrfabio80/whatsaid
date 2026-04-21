

## Update `docs/ARCHITECTURE.md` to reflect current implementation

The doc is mostly accurate but has drifted in several areas after the share-dedup, cache, logging, cleanup-config, and integrity-guard changes. I'll keep the structure intact and patch in what's new, fix what's stale, and remove what's obsolete.

### Drift identified

**New since the doc was last updated:**
1. `share_pdf_cache` table (cross-tab/cross-device PDF dedup) — not in §5.
2. `share_artifact_log` table (audit trail for reused vs uploaded share artifacts) — not in §5.
3. `cleanup_config` table (singleton, tunable TTL/batch size) — not in §5.
4. `validate_share_pdf_cache_path()` trigger + `share_pdf_cache_job_id_fkey` ON DELETE CASCADE + `content_hash` regex CHECK — not in §5 / triggers section.
5. `cleanup-expired-shares` edge function — referenced indirectly in §10 but missing from §6 function table.
6. `post-process` edge function — exists in code but missing from §6 table.
7. `cleanup_logs.share_pdf_cache_deleted` column — cleanup pipeline now tracks 4 categories.
8. Client-side `src/lib/export-cache.ts` (LRU dedup for DOCX/TXT/JSON exports) — not mentioned in §7 or §10.7.
9. `ShareButton` concurrency stack: in-tab `inFlightUploads` Map, `BroadcastChannel('whatsaid-share-upload')` lease, session-storage cache, DB-cache fallback, `createSignedUrl(path, 1)` existence check — not mentioned in §10.

**Stale / obsolete:**
- §10.7 says "no automated TTL on the bucket — *needs verification*" for share PDFs. This is now resolved by `cleanup-expired-shares` + `share_pdf_cache` TTL.
- §10.9 lists the cleanup-expired-shares schedule as "needs verification" — keep, still true.
- §10.8 already marks PDF storage retention as resolved — keep.

### Edits to apply

**§5.4 Sharing** — extend with three new tables:
- `share_pdf_cache` — per-`(job_id, content_hash, format)` index of previously-uploaded share artifacts. ON DELETE CASCADE from `jobs`. CHECK on `content_hash` (`^[0-9a-f]{8,128}$`). BEFORE INSERT/UPDATE trigger `validate_share_pdf_cache_path` enforces `storage_path` starts with `<job_id>/` and ends with `.<format>`. RLS: owner-scoped CRUD.
- `share_artifact_log` — append-only audit of every share attempt: `action ∈ {reused, uploaded}`, `source ∈ {session, db, fresh, stale-session, stale-db}`, optional `reason`. Owner SELECT/INSERT, admin SELECT.
- `cleanup_config` — singleton (`id=1`) with `share_pdf_cache_ttl_days` (default 30) and `cleanup_batch_size` (default 1000). Admin-only read/write.

**§5 triggers note** — replace "There are no triggers" assumption: document `validate_share_pdf_cache_path` as the one path-integrity trigger.

**§6 Edge functions** — add missing rows: `post-process`, `cleanup-expired-shares`. Update `cleanup-expired-shares` description to cover 3 phases (expired share blobs + orphans, old export blobs, stale `share_pdf_cache` rows), dry-run support, and config-driven tunables.

**New §7.7 "Client-side dedup & concurrency"** — document:
- `src/lib/export-cache.ts` — bounded LRU keyed by `(jobId, format, contentHash)` for TXT/JSON/DOC exports; PDF excluded because it has its own server-side cache.
- `src/components/ShareButton.tsx` upload pipeline lookup order: in-flight Map → `BroadcastChannel` lease (250 ms wait, 30 s leader timeout) → sessionStorage entry → DB `share_pdf_cache` row → fresh upload. Existence check uses `createSignedUrl(path, 1)` (O(1)) instead of `.list()`. Stale entries auto-clear and log a `stale-session` / `stale-db` event.

**§10.7 Export & PDF cost summary** — update PDF (share by email) row: storage write **deduped** via `share_pdf_cache` + in-tab/cross-tab guards; retention bounded by `cleanup-expired-shares` (TTL configurable in `cleanup_config`). Drop the "no automated TTL — needs verification" note.

**§10.8 Optimisation opportunities** — mark "PDF share dedup" and "share storage retention" as resolved; add a new still-open item: per-job aggregated cost log (already noted in §10.9 — keep).

**§10.9 needs verification** — keep cron schedules, AAI per-feature pricing. Add: whether `BroadcastChannel` is reliably available in all supported browsers (Safari ≥15.4 — needs verification for the small tail of older mobile Safari users).

**Footer "Last updated"** — refresh wording to mention the share-dedup + cleanup-config + audit-log additions.

### Non-goals

- No code changes.
- No restructuring of unrelated sections (branding, type scale, AAI poll backoff, credit model — all still accurate).
- No reordering of routes or providers.

### Technical details

- File touched: `docs/ARCHITECTURE.md` only.
- Approx +60 / −10 lines, mostly additive in §5.4, §6, §7 (new subsection), §10.7–10.9.
- All claims will be grounded in: `src/components/ShareButton.tsx`, `src/lib/export-cache.ts`, `supabase/functions/cleanup-expired-shares/index.ts`, `supabase/functions/post-process/index.ts`, current `<supabase-tables>` and `<db-functions>` from project context.

