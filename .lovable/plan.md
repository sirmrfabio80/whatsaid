
The user is clarifying the cap behavior. They want: if audio > 120 min, the user must spend a **second credit** (not be rejected). So the cap isn't a hard rejection — it's a per-credit ceiling.

Let me re-examine: they're now describing a hybrid — flat 1 credit per file *up to* 120 min, then +1 credit per additional 120-min block. This is a bracket again, but with a 120-min granularity instead of 15-min.

Need to confirm: is there an absolute upper file-length limit at all (e.g. 240 min, 480 min)? And does the existing 100 MB size cap stay?

I'll revise the plan accordingly and ask one clarifying question on the absolute ceiling.

## Revised Plan — 1 credit per 120-min block

### New pricing rule
- **1 credit covers up to 120 minutes** of audio in a single file.
- Files **longer than 120 min cost additional credits** (1 extra credit per extra 120-min block).
  - 0–120 min → 1 credit
  - 120–240 min → 2 credits
  - 240–360 min → 3 credits
  - …and so on.
- Regenerations stay free.
- 100 MB file-size cap unchanged.

### Why backend code stays untouched
`creditsForDuration(duration)` is the single source of truth. Every caller (`Convert.tsx` → `jobs.credits_charged` → `process-job` deduction → `watchdog-stale-jobs` refund) already passes through it. Changing only this function propagates correctly: the atomic `deduct_credits` RPC, refund logic, and admin bypass all keep working.

### Files to change

**1. `src/lib/pricing.ts`** — core rule
- `creditsForDuration` → `Math.max(1, Math.ceil(durationSeconds / 60 / 120))`.
- `MAX_DURATION` → raise to the chosen ceiling (see question below) or remove if unlimited within size cap.

**2. `src/components/AudioUploader.tsx`**
- Replace hardcoded `dur > 3600` with the `MAX_DURATION` import so the cap check is centralised.
- Update the per-file price preview to reflect multi-credit cost where applicable.

**3. `src/components/pricing/CreditDurationTable.tsx`**
- Replace bracket grid with a clear "1 credit = up to 120 min · longer files use additional credits" card (single tile + a one-line note).

**4. `src/components/pricing/PricingStudioMock.tsx`**
- Fix subline: "5 audio files · up to 120 min each".

**5. i18n — `src/i18n/locales/{en,fr,it}.json`**
- `audioUploader.dropDesc`: "max 60 min" → "max 120 min per credit".
- `audioUploader.fileTooLong`: rephrase to reflect the absolute ceiling (or remove if no rejection ceiling).
- `pricing.creditTableTitle/Sub`, `featureOneFile`, `featureOneCreditPerFile`: rewrite to the new 120-min-per-credit framing.
- `convert.howCreditStep1Desc`: aligned wording.

**6. Help/FAQ — `src/content/help/{faq,workflow,troubleshooting}.ts`**
- Update credit-cost FAQ + max-length lines (3 langs each).

**7. `docs/product/capabilities.md`** — CAP-001 + credit-charging capability + audio-limits footer.

**8. `docs/ARCHITECTURE.md` §5.2** — replace bracket table with the per-120-min model + show new formula.

**9. Memory**
- `mem://index.md` Core: "Credit model: 1 credit covers up to 120 min audio; longer files cost +1 credit per extra 120-min block."
- `mem://features/pricing` §2/§3: same update; mark per-credit cost recomputation as estimate.

### Validation
- `npm run docs:check:all`.
- Manual: 80-min file → 1 credit; 130-min file → 2 credits; verify balance drop and refund-on-failure both match.

### One open question

**What's the absolute maximum file length you want to accept?**
- (a) **240 min (2 credits max)** — keeps things contained, simplest UX.
- (b) **480 min (4 credits max)** — fits long workshops/lectures.
- (c) **No upper limit beyond the 100 MB size cap** — file size will naturally cap practical duration.

I'll proceed with whichever you pick (or default to **(b) 480 min** if you don't specify, since it's the most common "long meeting / half-day workshop" ceiling and still bounded).
