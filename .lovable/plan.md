

# WhatSaid -- Revised Plan

## A. What Is Weak or Unsafe in the Previous Pricing Logic

The previous plan had several gaps:

1. **Cost per job was underestimated.** The $1.60 figure for a 30-min job assumed ~$0.05/min total. Actual AssemblyAI cost for transcription + diarization is much lower (~$0.043 for 15 min), but the previous plan failed to itemize each cost line, making it impossible to verify.

2. **LLM post-processing cost was handwaved.** "~$0.01-0.05" per summary/custom output is vague. For a 30-min transcript (~5,000-8,000 words), a summary call through Lovable AI (Gemini Flash) is realistically ~$0.01-0.03 per call. Three outputs (summary + key actions + custom) = ~$0.03-0.09. This was not explicitly added to the per-job cost.

3. **Retry cost was ignored.** If a transcription fails and must be retried, you pay the STT provider again. The previous plan had no retry budget.

4. **Guest abuse was under-addressed.** 3 free regenerations per guest with no rate limiting or CAPTCHA is exploitable. Each regeneration costs you an LLM call.

5. **Storage egress was not considered.** Supabase free tier includes 2GB egress. Audio files temporarily stored + downloaded results could exceed this at moderate volume.

6. **The 30-minute credit boundary was arbitrary.** A 29-min file and a 5-min file cost the same, which penalizes short-file users and subsidizes long-file users.

---

## B. Revised Unit Economics Model

### Verified external costs (per minute of audio)

| Cost line | AssemblyAI (Universal-2) | Notes |
|---|---|---|
| Base transcription | $0.0025/min ($0.15/hr) | Includes language detection |
| Speaker diarization | $0.00033/min ($0.02/hr) | Add-on |
| **STT subtotal** | **$0.00283/min** | |

| Cost line | Per call | Notes |
|---|---|---|
| Lovable AI -- summary | ~$0.01-0.02 | ~5K-8K word transcript input |
| Lovable AI -- key actions | ~$0.01-0.02 | Same input, shorter output |
| Lovable AI -- custom prompt | ~$0.01-0.02 | Same |
| **LLM subtotal (3 outputs)** | **~$0.03-0.06** | Per job, independent of duration |

| Cost line | Amount | Notes |
|---|---|---|
| Supabase Storage (temp) | ~$0.00 | Audio deleted after processing |
| Stripe fee (one-off) | 2.9% + $0.30 | Per transaction |
| Retry budget | +15% on STT cost | ~1 in 7 jobs may need retry |

### Full cost per job (worst-case estimates)

| Job duration | STT cost | LLM cost | Retry buffer | Total variable cost |
|---|---|---|---|---|
| 5 min | $0.014 | $0.06 | $0.002 | **$0.08** |
| 15 min | $0.042 | $0.06 | $0.006 | **$0.11** |
| 30 min | $0.085 | $0.06 | $0.013 | **$0.16** |
| 60 min | $0.170 | $0.06 | $0.026 | **$0.26** |

Key insight: **LLM post-processing cost dominates for short files.** STT cost only becomes significant above ~20 minutes. This means a flat "1 credit = 1 job" model is viable because the cost difference between a 5-min and 30-min file is only ~$0.08.

---

## C. AssemblyAI vs Deepgram for WhatSaid

| Criterion | AssemblyAI | Deepgram |
|---|---|---|
| **Base STT cost** | $0.0025/min (Universal-2) | $0.0077/min (Nova-3 Mono) |
| **Diarization cost** | $0.00033/min | $0.002/min |
| **Total STT+diarization/min** | **$0.00283** | **$0.0097** |
| **Cost for 15-min job** | $0.043 | $0.146 |
| **Cost for 30-min job** | $0.085 | $0.291 |
| Language detection | Included (auto) | Included (auto) |
| Language override | Yes (`language_code` param) | Yes (`language` param) |
| .m4a support | Yes | Yes |
| Async API (long files) | Yes (submit + poll) | Yes (pre-recorded REST) |
| Language count | 99 (Universal-2) | 45+ (Nova-3) |
| Free tier | 333 hours free | $200 credit (~430 hrs at Nova-3) |
| Diarization quality | Strong, well-documented | Strong, well-documented |

**Recommendation: AssemblyAI Universal-2.** It is 3.4x cheaper per minute, supports 99 languages (important for auto-detection), and has a generous free tier for development. The cost advantage compounds -- at 1,000 jobs/month averaging 15 min, you save ~$100/month vs Deepgram.

If you later need the 6-language accuracy of Universal-3 Pro ($0.0035/min), you can upgrade per-request for those languages only.

---

## D. Credit Model Comparison

### Model A: 1 credit = 15 minutes of transcription
- Pro: Fair to users -- short files cost less
- Pro: Duration-proportional pricing aligns with your STT costs
- Con: Users must calculate credits before uploading ("is my file 14 or 16 minutes?")
- Con: Fractional credit display is confusing ("0.73 credits remaining")
- Con: More complex billing logic in code

### Model B: 1 credit = 1 job up to 15 min, 2 credits = 15-30 min, etc.
- Pro: Simple mental model -- users see whole numbers
- Pro: Easy to implement (integer math only)
- Pro: Tier boundaries are clear and predictable
- Con: A 16-min file costs 2x a 14-min file (feels unfair at boundaries)
- Con: Slightly over-charges short files

### Recommendation: Model B with these tiers

| Duration | Credits |
|---|---|
| 0-15 min | 1 credit |
| 15-30 min | 2 credits |
| 30-45 min | 3 credits |
| 45-60 min | 4 credits |

Rationale: The actual cost difference between a 5-min and 15-min job is only ~$0.03 in STT (LLM cost is flat). The simplicity of whole-credit tiers far outweighs the minor unfairness at boundaries. Users understand "1 credit = 1 short job" instantly.

The boundary issue is mitigated by showing the user "Your file is 16:23 -- this will use 2 credits" before they confirm.

---

## E. Guest Payment Flow

### Option 1: Pay first, then upload
```text
Landing -> Select tier ($4.99 / $8.99) -> Stripe Checkout -> 
  Return with session_id -> Upload audio -> Process -> Results
```
- Pro: Zero abuse risk -- you only process paid jobs
- Pro: No temp storage of unpaid files
- Con: User pays before knowing if their file is compatible
- Con: Refund needed if file is invalid/corrupt after payment
- Con: User doesn't know which price tier to pick without uploading first

### Option 2: Upload first, then pay
```text
Landing -> Upload audio -> Validate format + detect duration -> 
  Show price ("16 min = $4.99") -> Stripe Checkout -> 
  Return with session_id -> Process -> Results
```
- Pro: User sees the price based on their actual file duration
- Pro: Invalid files rejected before payment (no refunds)
- Pro: Better UX -- user understands what they're paying for
- Con: Temp storage of unpaid files (must expire/delete after ~15 min)
- Con: Abuse vector: repeated uploads without paying (mitigated by rate limiting)

### Recommendation: Upload first, then pay (Option 2)

The UX advantage is decisive. A user who pays $8.99 and then discovers their .m4a is corrupt will demand a refund and leave a bad review. Validating first eliminates this entirely.

Anti-abuse for temp uploads:
- Files stored with a 15-minute TTL, auto-deleted if unpaid
- Rate limit: 3 uploads per IP per hour without payment
- File validated server-side (format, duration, size) before storage
- No processing until Stripe webhook confirms payment

---

## F. Revised Architecture Changes

### 1. Guest flow (upload-first)

```text
Browser                    Edge Function         Storage        Stripe         AssemblyAI
  |                            |                    |              |               |
  |-- upload audio ----------->|-- validate ------->|              |               |
  |                            |   format/size/dur  |              |               |
  |<-- duration + price -------|                    |              |               |
  |                            |-- store temp ----->| (15min TTL)  |               |
  |-- checkout (price tier) ---|------------------- |------------->|               |
  |                            |                    |              |               |
  |   (Stripe webhook) ------->|-- mark job paid ---|              |               |
  |                            |-- submit STT ------|--------------|-------------->|
  |                            |   (with lang_code) |              |               |
  |                            |<-- transcript -----|--------------|---------------|
  |                            |-- LLM calls -------|              |               |
  |                            |-- delete audio --->| (immediate)  |               |
  |<-- results via token ------|                    |              |               |
```

### 2. Language override as core feature

- Edge Function accepts `language_code` parameter (default: `null` for auto-detect)
- After transcription completes, detected language is returned and stored on the job
- UI shows a language dropdown pre-filled with detected language
- User can change language and click "Re-transcribe" -- this costs 1 additional credit (account) or is blocked for guests (they paid for one run)
- For guests: language selection is available BEFORE payment, shown after duration detection. If auto-detect seems wrong, they pick manually before paying.

### 3. Audio deletion lifecycle

```text
Upload -> temp storage (15-min TTL) -> payment confirmed -> 
  sent to AssemblyAI via signed URL -> transcription complete -> 
  DELETE from Supabase Storage (immediate) -> 
  only text outputs remain in DB
```

- No audio is ever retained after processing
- Supabase Storage bucket policy: objects auto-expire after 1 hour (safety net)
- Job record stores `audio_deleted_at` timestamp for audit

### 4. Database schema changes

- `jobs.duration_seconds` -- detected from uploaded file, used for credit calculation
- `jobs.language_detected` -- from STT provider
- `jobs.language_selected` -- user override (nullable, defaults to detected)
- `jobs.guest_email` -- optional, for receipt delivery
- `jobs.temp_file_path` -- cleared after deletion
- `jobs.audio_deleted_at` -- timestamp
- `jobs.credits_charged` -- integer, based on duration tier

---

## G. Caps and Anti-Abuse Guardrails

| Guardrail | Value | Rationale |
|---|---|---|
| Max file duration | 60 minutes | Caps max STT cost at ~$0.17 |
| Max file size | 200 MB | Prevents storage abuse |
| Guest upload rate limit | 3 per IP per hour (unpaid) | Prevents temp storage flooding |
| Guest concurrent jobs | 1 | Prevents parallel abuse |
| Account concurrent jobs | 3 | Reasonable for paying users |
| Temp file TTL | 15 minutes | Auto-delete if unpaid |
| Guest regeneration | 2 free, then blocked | Must create account + buy credits for more |
| Account regeneration | 3 free per job, then 0.5 credits | Prevents LLM abuse |
| Minimum charge | $2.99 (guest) | Below this, Stripe fees eat margin |
| CAPTCHA on guest upload | Yes (Cloudflare Turnstile) | Prevents bot uploads |

---

## H. Final Commercial Model for WhatSaid

### Credit definition
1 credit = 1 transcription job up to 15 minutes. 2 credits for 15-30 min. 3 for 30-45 min. 4 for 45-60 min.

### Guest pricing (one-off, no account)

| Duration | Price | Your cost | After Stripe | Margin |
|---|---|---|---|---|
| 0-15 min | $2.99 | ~$0.11 | ~$2.60 | ~96% |
| 15-30 min | $4.99 | ~$0.16 | ~$4.55 | ~96% |
| 30-60 min | $7.99 | ~$0.26 | ~$7.46 | ~97% |

Note: margins are high because external API costs are very low. The value is in the product experience, not raw API cost. These prices are competitive with competitors like Otter.ai ($16.99/mo) and Descript ($24/mo).

### Credit pack pricing (account required)

| Pack | Price | Per credit | vs guest 15-min |
|---|---|---|---|
| 5 credits | $11.99 | $2.40 | 20% off |
| 15 credits | $29.99 | $2.00 | 33% off |
| 40 credits | $59.99 | $1.50 | 50% off |

### Regeneration pricing
- 2 free custom-output regenerations per job (guest and account)
- Account users: 0.5 credits per additional regeneration
- Guests: blocked after 2 -- must create account

### What is included vs separate

| Item | Included in credit/payment | Separate cost |
|---|---|---|
| Transcription + diarization | Yes | -- |
| Language auto-detection | Yes | -- |
| Summary output | Yes | -- |
| Key actions output | Yes | -- |
| First custom prompt output | Yes | -- |
| Re-transcription (language change) | -- | 1 credit (account only) |
| Additional custom regenerations | -- | 0.5 credits after 2 free |
| DOCX/PDF export | Yes (v1.1) | -- |

### Explicit cost breakdown transparency

Every price above includes:
- AssemblyAI transcription + diarization
- Lovable AI for summary, key actions, custom output (3 calls)
- Temporary storage + deletion
- Stripe transaction fees
- ~15% retry buffer

Lovable AI cost is separate from transcription cost. Transcription is handled by AssemblyAI ($0.00283/min). LLM post-processing is handled by Lovable AI (~$0.02 per call, ~$0.06 per job for 3 outputs). Both are included in the prices above.

