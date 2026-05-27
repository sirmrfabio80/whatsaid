/**
 * Pure (DB-free) helpers for the prune-retention sweeper. Keeping the
 * planning logic free of supabase-js makes it cheap to unit-test the
 * critical decisions: cutoff math, batch capping, and which datasets are
 * skipped because they are disabled or have retention_days = 0.
 *
 * The dispatch table here is the single source of truth for which Postgres
 * table + timestamp column each retention_config row maps to, and for the
 * mutation strategy (delete vs anonymize). The runner translates a plan into
 * actual supabase-js calls.
 */

export type Strategy = "delete" | "anonymize";

export interface RetentionConfigRow {
  dataset_key: string;
  retention_days: number;
  strategy: Strategy;
  enabled: boolean;
}

export interface DatasetMapping {
  table: string;
  timestampColumn: string;
  /** Extra filter applied on top of the cutoff (e.g. limit anonymize to
   *  rows that still have PII). Optional. */
  extraFilter?: { column: string; op: "is" | "not.is"; value: unknown };
  /** Anonymize-only: which columns to null out. Ignored for delete. */
  anonymizeNulls?: string[];
}

/**
 * Single source of truth for dataset → table mapping. Adding a new dataset
 * means: (1) seed a row in retention_config, (2) add an entry here.
 */
export const DATASET_MAP: Record<string, DatasetMapping> = {
  consent_events: {
    table: "consent_events",
    timestampColumn: "accepted_at",
    extraFilter: { column: "ip_hash", op: "not.is", value: null },
    anonymizeNulls: ["ip_hash", "user_agent", "metadata", "user_id"],
  },
  credit_transactions: {
    table: "credit_transactions",
    timestampColumn: "created_at",
  },
  email_send_log: {
    table: "email_send_log",
    timestampColumn: "created_at",
  },
  usage_events: {
    table: "usage_events",
    timestampColumn: "created_at",
  },
  cleanup_logs: {
    table: "cleanup_logs",
    timestampColumn: "created_at",
  },
  async_jobs_finished: {
    table: "async_jobs",
    timestampColumn: "updated_at",
    extraFilter: { column: "status", op: "is", value: "completed" },
  },
};

export interface PlannedDataset {
  dataset_key: string;
  strategy: Strategy;
  cutoff_iso: string;
  table: string;
  timestamp_column: string;
  anonymize_nulls?: string[];
  extra_filter?: DatasetMapping["extraFilter"];
}

export interface SkippedDataset {
  dataset_key: string;
  reason: "disabled" | "zero_retention" | "unmapped" | "filter_not_requested";
}

export interface PrunePlan {
  planned: PlannedDataset[];
  skipped: SkippedDataset[];
}

export interface BuildPlanInput {
  rows: RetentionConfigRow[];
  now: Date;
  /** When provided, only datasets in this list are planned; everything else
   *  is reported as `filter_not_requested`. */
  onlyDatasets?: string[];
}

export function buildPlan({ rows, now, onlyDatasets }: BuildPlanInput): PrunePlan {
  const planned: PlannedDataset[] = [];
  const skipped: SkippedDataset[] = [];

  for (const row of rows) {
    if (onlyDatasets && !onlyDatasets.includes(row.dataset_key)) {
      skipped.push({ dataset_key: row.dataset_key, reason: "filter_not_requested" });
      continue;
    }
    if (!row.enabled) {
      skipped.push({ dataset_key: row.dataset_key, reason: "disabled" });
      continue;
    }
    if (row.retention_days <= 0) {
      skipped.push({ dataset_key: row.dataset_key, reason: "zero_retention" });
      continue;
    }
    const mapping = DATASET_MAP[row.dataset_key];
    if (!mapping) {
      skipped.push({ dataset_key: row.dataset_key, reason: "unmapped" });
      continue;
    }
    const cutoff = new Date(now.getTime() - row.retention_days * 86_400_000);
    planned.push({
      dataset_key: row.dataset_key,
      strategy: row.strategy,
      cutoff_iso: cutoff.toISOString(),
      table: mapping.table,
      timestamp_column: mapping.timestampColumn,
      anonymize_nulls: mapping.anonymizeNulls,
      extra_filter: mapping.extraFilter,
    });
  }

  return { planned, skipped };
}

/** Bounds the per-dataset batch size so a single run cannot stall on a
 *  pathological table. Caller can override with a smaller value. */
export const DEFAULT_BATCH_SIZE = 1000;
export const MAX_BATCH_SIZE = 5000;

export function clampBatchSize(requested: number | undefined): number {
  if (!requested || requested <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(requested, MAX_BATCH_SIZE);
}
