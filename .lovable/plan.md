

## Plan: Per-user region routing for AssemblyAI

### Goal
Detect the user's country in the `transcribe` edge function and route US users to `api.assemblyai.com/v2`, everyone else to the EU endpoint. Admin can toggle this behavior on/off per template.

### Technical design

**1. Schema additions** (`src/lib/transcribe-template.ts`)
- Add to `TranscribeTemplateConfig`:
  - `geo_routing_enabled: boolean` — master toggle
  - `us_base_url: string` — US endpoint, defaults to `https://api.assemblyai.com/v2`
  - (existing `base_url` becomes the "default / non-US" URL — keep field name for backward compat, label it as "Default base URL (non-US)" in the UI)
- Update `DEFAULT_TEMPLATE_CONFIG`, `parseTemplateConfig`, `configsEqual` accordingly.

**2. Country detection in `transcribe` edge function**
- Read country from request headers in this priority order:
  1. `cf-ipcountry` (Cloudflare)
  2. `x-vercel-ip-country`
  3. `x-country-code` (generic)
- If `geo_routing_enabled === true` AND country `=== "US"` → use `cfg.us_base_url`
- Otherwise → use existing `cfg.base_url`
- Log resolved country + chosen base URL for observability.
- Fallback to `cfg.base_url` if no header present or geo-routing disabled.

**3. Admin UI** (`src/components/admin/TemplateEditor.tsx`)
- New "Region routing" section with:
  - Toggle: "Enable geo-routing"
  - Input: "Default base URL (non-US)" (renamed from current "Base URL")
  - Input: "US base URL" (only enabled when geo-routing is on)
- Hint text explains: when enabled, US-detected requests use the US URL; all others use the default.

**4. Preview panel** (`src/lib/transcribe-template.ts` → `buildPreviewPayload` & `RequestPreviewPanel`)
- Add `country?: string` to `PreviewSampleJob`
- Compute resolved base URL in preview using same logic as edge function
- Add country selector (Auto/US/EU) toggle to preview sample controls — surfaces which endpoint would actually be hit
- Show resolved endpoint URL above the JSON payload (it's not in the body itself, but it's the most useful piece of info)

**5. Database migration**
- No schema change needed — `config` is `jsonb`. New fields are added via the application schema only.
- Existing active template rows will fall back via `parseTemplateConfig` to defaults (`geo_routing_enabled: false`, `us_base_url: "https://api.assemblyai.com/v2"`), so behavior is unchanged until an admin opts in.

### Files to edit
- `src/lib/transcribe-template.ts` — schema, defaults, parser, equality, preview helper
- `src/components/admin/TemplateEditor.tsx` — new Region routing section
- `src/components/admin/RequestPreviewPanel.tsx` — country toggle + resolved endpoint display
- `supabase/functions/transcribe/index.ts` — country detection + base URL resolution + log line

### Acceptance
- Admin can toggle geo-routing on a template and set both URLs.
- With geo-routing ON: US-headered request hits `api.assemblyai.com/v2`; others hit EU URL.
- With geo-routing OFF: all requests hit `cfg.base_url` (current behavior).
- Preview panel reflects which endpoint would be used for a chosen sample country.
- Logs show `[transcribe] country=XX base_url=...` per job for auditability.

