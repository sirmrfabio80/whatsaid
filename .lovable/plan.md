
Investigation result: WhatSaid is not reproducing the successful direct AssemblyAI conditions for this fixture.

A. Exact differences found between direct AssemblyAI and current WhatSaid

```text
Field                              | Direct successful pattern                    | Current WhatSaid failing run                         | Finding
-----------------------------------|----------------------------------------------|-----------------------------------------------------|--------
speech_models                      | ["universal-3-pro"]                          | requested ["universal-3-pro","universal-2"]         | Material divergence
actual model used                  | universal-3-pro (per direct success pattern) | raw_response.speech_model_used = "universal-2"      | Biggest confirmed divergence
temperature                        | 0                                            | 0.1                                                 | Divergence
language handling                  | Case A: language_code "it" / Case B: auto    | auto + language_confidence_threshold 0.4            | Diverges from A, roughly matches B
speaker_labels                     | true                                         | true                                                | Match
speaker_options                    | none                                         | none on the failing job                             | Match; not the current culprit
prompt                             | none                                         | recovery prompt injected by default                 | Material divergence
keyterms_prompt                    | none                                         | none                                                | Match
disfluencies                       | false                                        | true                                                | Material divergence
speech_threshold                   | not specified in direct case                 | 0.05                                                | Extra tuning in WhatSaid
endpoint / region                  | not proven from provided direct case         | https://api.eu.assemblyai.com/v2                    | Unknown whether this differs
audio input                        | likely raw original file                     | uploads enhanced WAV, not original M4A              | Material divergence
file format / audit trail          | raw M4A                                      | temp_file_path = Fatebenefratelli_enhanced.wav      | Effective file is different
stored file metadata               | should reflect actual uploaded file          | job still stores original name/size (991652 .m4a)   | Audit trail is misleading
raw AssemblyAI response            | direct transcript reportedly says Romania    | stored raw_response already says "alla vagomania"   | Failure originates upstream
rendering / downstream mutation    | unknown                                      | UI renders stored transcript content faithfully     | No evidence of downstream worsening
```

Evidence from code/data:
- `src/pages/Convert.tsx` hard-defaults transcription to `{ strategy: "recovery", enhanceAudio: true }`.
- `supabase/functions/transcribe/index.ts` sends:
  - `speech_models: ["universal-3-pro", "universal-2"]`
  - `temperature: 0.1`
  - recovery `prompt`
  - `disfluencies: true`
  - auto language detection + threshold `0.4`
- The failing job row confirms the uploaded storage object was `Fatebenefratelli_enhanced.wav`.
- The stored `raw_response` for the failing job already contains the bad phrase, and reports `speech_model_used = universal-2`.
- The transcript shown in the app matches that stored upstream output; the app currently renders it faithfully and does not repair suspicious low-confidence spans or suspicious speaker-boundary splits.

B. Most likely reason direct AssemblyAI succeeds while WhatSaid fails

Primary conclusion:
- The failure is most likely caused by WhatSaid sending a meaningfully different request and a different effective audio file than the successful direct test.

Bluntly:
- The raw recognition and speaker-split failure originate upstream in the AssemblyAI output returned to WhatSaid.
- WhatSaid currently renders that output faithfully.
- WhatSaid’s contribution is not “0%”: it is choosing a more opinionated setup than the successful direct test, and it does not currently detect or repair suspicious low-confidence spans or suspicious speaker-boundary splits.

Most likely root-cause ranking:
1. H3 — `["universal-3-pro","universal-2"]` behaves differently than `["universal-3-pro"]`: very high  
   - Confirmed actual model used was `universal-2`, not U3P.
2. H1 — strategy prompt routing is worse than no-prompt U3P default: very high  
   - Current production default is recovery prompt + disfluencies, while the successful direct test is simpler.
3. H7 — WhatSaid is not submitting the same effective file/audio: high  
   - It sends enhanced WAV, not the raw M4A used in the direct-success scenario.
4. H2 — `temperature: 0.1` is worse than `temperature: 0`: medium  
   - Real divergence, but likely secondary to model/prompt differences.
5. H5 — enhancement is neutral/beneficial and request config is the real problem: medium-high  
   - Current evidence points here first.
6. H6 — enhancement is degrading this file: medium, unproven  
   - Possible, but not yet evidenced.
7. H4 — `speaker_options` / diarization hints are hurting this file: low  
   - Current failing job sent no `speaker_options`.
8. H8 — downstream parsing/rendering is worsening the result: very low  
   - Stored raw response is already wrong.

C. What should be changed first

Minimum-risk remediation order:
1. First reproduce the successful direct conditions as closely as possible for this exact fixture:
   - `speech_models: ["universal-3-pro"]`
   - `speaker_labels: true`
   - `temperature: 0`
   - no prompt
   - no disfluencies
   - no `speaker_options`
   - test both:
     - auto language
     - explicit `language_code: "it"`
2. Run that simple baseline against both:
   - raw M4A
   - enhanced WAV
3. Capture and compare for each run:
   - `speech_model_used`
   - phrase at 34–38s
   - utterance split around 36s
   - word confidences in the suspicious span
4. If the simple U3P-only no-prompt path wins, make that the new default before considering any repair layer.

What I would change first after verification:
- Stop defaulting normal jobs to recovery prompt routing.
- Stop defaulting normal jobs to the fallback array until proven necessary for this product path.
- Use the simpler no-prompt U3P baseline as the primary path.
- Keep enhancement under test, not assumed good or bad.

D. What should remain unchanged

Do not change first:
- `speaker_labels: true`
- transcript rendering / UI transcript display
- post-processing summary flow
- speaker repair / confidence-repair layers
- `speaker_options` behavior for this bug specifically
- enhancement as a feature in general, until raw-vs-enhanced is proven on matched requests

Also important:
- Do not attribute this failure to downstream rendering.
- Do not treat explicit Italian as a presumed fix; treat it as a test hypothesis.
- Do not treat `custom_spelling` / keyterms as a generic fix here.

E. Minimal verification plan using the same regression audio

Smallest high-signal comparison set:
1. Direct-match baseline A:
   - raw M4A
   - `["universal-3-pro"]`
   - `speaker_labels: true`
   - auto language
   - `temperature: 0`
   - no prompt
   - no disfluencies
   - no `speaker_options`
2. Direct-match baseline B:
   - raw M4A
   - same as above, but `language_code: "it"`
3. Enhanced-only control:
   - enhanced WAV
   - same exact params as baseline A
4. Current WhatSaid control:
   - enhanced WAV
   - current production settings

Pass/fail checks:
- phrase correctness: contains `direttamente dalla Romania`
- no false speaker split at the bad boundary
- `speech_model_used` is visible and compared
- suspicious-span confidences are compared directly
- raw response text is stored for each run

Expected lowest-risk outcome:
- If baseline A or B beats current WhatSaid, the first fix is simplification, not repair logic.
- If raw beats enhanced under matched params, enhancement should be bypassed for this path or file class.
- If enhanced matches raw under matched params, the real issue is request configuration, not preprocessing.

Bottom line:
- Yes, WhatSaid is currently sending different parameters than the successful direct test.
- Yes, WhatSaid is currently sending a different effective audio file than the likely direct raw-file test.
- The strongest confirmed divergence is that WhatSaid requested a fallback array and the failing run actually used `universal-2`.
- The most likely low-risk fix direction is to simplify WhatSaid so it matches the successful direct U3P baseline, then verify raw vs enhanced under identical params.
