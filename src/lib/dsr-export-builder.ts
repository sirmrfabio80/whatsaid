/**
 * Pure (network-free) builder for the DSR portability ZIP payload.
 *
 * Keeping the assembly free of supabase-js makes it cheap to unit-test the
 * contract: every documented file is present, and no service-internal column
 * leaks into the user-facing export.
 *
 * The edge function (`dsr-export`) fetches rows from the database, hands them
 * to `buildDsrManifest`, and feeds the resulting entries into JSZip. Tests
 * exercise the manifest builder with in-memory fixtures — no DB required.
 */

/** Columns that must NEVER appear in a DSR export. Internal plumbing only. */
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
}

export interface ManifestEntry {
  path: string;
  /** UTF-8 string contents. Binary not currently used in DSR exports. */
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

function stripMany<T extends AnyRow>(rows: T[], drop: readonly string[]): T[] {
  return rows.map((r) => stripColumns(r, drop) as T);
}

function jsonFile(path: string, value: unknown): ManifestEntry {
  return { path, content: JSON.stringify(value, null, 2) };
}

/**
 * Pull a plain-text transcript out of a `job_outputs` row if one is present.
 * Outputs have `output_type` like "transcript" / "summary" / "custom".
 */
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

    // Group custom outputs + variants under one JSON for cleanliness.
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
    "profile.json          Your account profile (display name, language, preferences).",
    "credits.json          Current credit balance and the full credit ledger.",
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
