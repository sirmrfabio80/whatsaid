/**
 * Edge-function copy of the DSR manifest builder.
 *
 * This file is a thin re-export wrapper around `src/lib/dsr-export-builder.ts`
 * so the same pure builder is unit-tested from the Vitest side and consumed
 * here. Deno can't reach into `src/`, so the implementation is duplicated as
 * a copy kept byte-equal by a small check in CI (see scripts/ — TODO).
 *
 * If you change one, change the other.
 */

export const JOB_INTERNAL_COLUMNS = [
  "temp_file_path",
  "assemblyai_transcript_id",
  "assemblyai_delete_status",
  "stripe_payment_id",
  "guest_token",
  "watchdog_retry_count",
  "language_detection_diagnostics",
  "transcription_config",
] as const;

export const PROFILE_INTERNAL_COLUMNS = [
  "needs_password_setup",
] as const;

export type AnyRow = Record<string, unknown>;

export interface DsrFixtures {
  profile: AnyRow | null;
  creditBalance: AnyRow | null;
  creditTransactions: AnyRow[];
  consentEvents: AnyRow[];
  jobs: AnyRow[];
  jobOutputsByJob: Record<string, AnyRow[]>;
  variantsByOutput: Record<string, AnyRow[]>;
  tagsByJob: Record<string, AnyRow[]>;
  sharesSent: AnyRow[];
  usageEvents: AnyRow[];
  notifications: AnyRow[];
  /** Art. 15 — the user's own DSR audit trail (export/rectification/etc). */
  dsrRequests?: AnyRow[];
  /** Art. 15 — record of Art. 14 notices sent on the user's behalf. */
  recipientNotifications?: AnyRow[];
}


export interface ManifestEntry {
  path: string;
  content: string;
}

function stripColumns<T extends AnyRow>(row: T | null, drop: readonly string[]): T | null {
  if (!row) return row;
  const out: AnyRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (!drop.includes(k)) out[k] = v;
  }
  return out as T;
}

function jsonFile(path: string, value: unknown): ManifestEntry {
  return { path, content: JSON.stringify(value, null, 2) };
}

function findOutput(outputs: AnyRow[] | undefined, type: string): AnyRow | undefined {
  return outputs?.find((o) => o["output_type"] === type);
}

export function buildDsrManifest(
  f: DsrFixtures,
  meta: { generatedAt: string; userId: string; userEmail: string | null },
): ManifestEntry[] {
  const entries: ManifestEntry[] = [];

  entries.push(jsonFile("profile.json", stripColumns(f.profile, PROFILE_INTERNAL_COLUMNS)));
  entries.push(
    jsonFile("credits.json", {
      balance: f.creditBalance,
      transactions: f.creditTransactions,
    }),
  );
  entries.push(jsonFile("consent_history.json", f.consentEvents));
  entries.push(jsonFile("shares_sent.json", f.sharesSent));
  entries.push(jsonFile("usage_events.json", f.usageEvents));
  entries.push(jsonFile("notifications.json", f.notifications));
  entries.push(jsonFile("dsr_requests.json", f.dsrRequests ?? []));
  entries.push(jsonFile("recipient_notifications.json", f.recipientNotifications ?? []));

  for (const job of f.jobs) {
    const jobId = String(job["id"]);
    const cleanJob = stripColumns(job, JOB_INTERNAL_COLUMNS);
    entries.push(jsonFile(`jobs/${jobId}/job.json`, cleanJob));

    const outputs = f.jobOutputsByJob[jobId] ?? [];
    const transcript = findOutput(outputs, "transcript");
    const summary = findOutput(outputs, "summary");
    if (transcript) {
      entries.push({
        path: `jobs/${jobId}/transcript.txt`,
        content: String(transcript["content"] ?? ""),
      });
      entries.push(jsonFile(`jobs/${jobId}/transcript.json`, transcript));
    }
    if (summary) {
      entries.push({
        path: `jobs/${jobId}/summary.txt`,
        content: String(summary["content"] ?? ""),
      });
    }
    const customOutputs = outputs
      .filter((o) => o["output_type"] !== "transcript" && o["output_type"] !== "summary")
      .map((o) => ({
        ...o,
        variants: f.variantsByOutput[String(o["id"])] ?? [],
      }));
    entries.push(jsonFile(`jobs/${jobId}/custom_outputs.json`, customOutputs));
    entries.push(jsonFile(`jobs/${jobId}/tags.json`, f.tagsByJob[jobId] ?? []));
  }

  entries.push({
    path: "README.txt",
    content: buildReadme(meta, f),
  });

  return entries;
}

function buildReadme(
  meta: { generatedAt: string; userId: string; userEmail: string | null },
  f: DsrFixtures,
): string {
  return [
    "WhatSaid — Your data export",
    "===========================",
    "",
    `Generated at: ${meta.generatedAt}`,
    `Account ID:   ${meta.userId}`,
    meta.userEmail ? `Account email: ${meta.userEmail}` : "Account email: (not available)",
    "",
    "This archive is your portable copy of the personal data WhatSaid holds about",
    "your account, provided under UK GDPR Articles 15 (right of access) and 20",
    "(right to data portability).",
    "",
    "Contents",
    "--------",
    "notifications.json    In-app notifications (read: 90 days, unread: 365 days).",
    "dsr_requests.json     Your own data-subject requests (access / rectification / erasure).",
    "recipient_notifications.json  Art. 14 notices we sent on your behalf when you shared a transcript.",

    "consent_history.json  Reg. 37 (CCA 2013) consent events tied to this account.",
    "shares_sent.json      Transcripts you have shared by email.",
    "usage_events.json     Recent usage events used for quota enforcement (last 90 days).",
    "notifications.json    In-app notifications (read: 90 days, unread: 365 days).",
    `jobs/{job_id}/        One folder per transcription job (${f.jobs.length} total).`,
    "    job.json          Job metadata (excludes service-internal fields).",
    "    transcript.txt    Plain-text transcript (if present).",
    "    transcript.json   Structured transcript with timestamps and speakers.",
    "    summary.txt       AI-generated summary (if present).",
    "    custom_outputs.json  Custom AI outputs and translated variants.",
    "    tags.json         Tags applied to the job.",
    "",
    "Retention",
    "---------",
    "This archive is retained in our private storage for 7 days from generation,",
    "then permanently deleted. The signed download URL also expires after 7 days.",
    "",
    "Other rights",
    "------------",
    "If anything here is wrong, request a correction from Settings → Your data, or",
    "email support. To erase your account and associated data, use Settings → Danger",
    "zone → Delete account. To escalate, contact the UK Information Commissioner's",
    "Office at https://ico.org.uk/make-a-complaint/.",
    "",
  ].join("\n");
}
