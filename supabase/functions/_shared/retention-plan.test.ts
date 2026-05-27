import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPlan,
  clampBatchSize,
  DATASET_MAP,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  type RetentionConfigRow,
} from "./retention-plan.ts";

const NOW = new Date("2026-05-27T12:00:00Z");

function row(
  dataset_key: string,
  overrides: Partial<RetentionConfigRow> = {},
): RetentionConfigRow {
  return {
    dataset_key,
    retention_days: 30,
    strategy: "delete",
    enabled: true,
    ...overrides,
  };
}

Deno.test("buildPlan computes cutoff = now - retention_days", () => {
  const { planned } = buildPlan({
    rows: [row("usage_events", { retention_days: 10 })],
    now: NOW,
  });
  assertEquals(planned.length, 1);
  // 10 days before NOW
  assertEquals(planned[0].cutoff_iso, "2026-05-17T12:00:00.000Z");
  assertEquals(planned[0].table, "usage_events");
  assertEquals(planned[0].timestamp_column, "created_at");
});

Deno.test("buildPlan skips disabled datasets", () => {
  const { planned, skipped } = buildPlan({
    rows: [row("usage_events", { enabled: false })],
    now: NOW,
  });
  assertEquals(planned.length, 0);
  assertEquals(skipped[0].reason, "disabled");
});

Deno.test("buildPlan skips zero/negative retention to avoid wiping everything", () => {
  const { planned, skipped } = buildPlan({
    rows: [
      row("usage_events", { retention_days: 0 }),
      row("email_send_log", { retention_days: -1 }),
    ],
    now: NOW,
  });
  assertEquals(planned.length, 0);
  assertEquals(skipped.length, 2);
  assert(skipped.every((s) => s.reason === "zero_retention"));
});

Deno.test("buildPlan flags unmapped datasets so admins notice typos", () => {
  const { planned, skipped } = buildPlan({
    rows: [row("not_a_real_dataset")],
    now: NOW,
  });
  assertEquals(planned.length, 0);
  assertEquals(skipped[0].reason, "unmapped");
});

Deno.test("buildPlan honours onlyDatasets filter (used by admin one-off runs)", () => {
  const { planned, skipped } = buildPlan({
    rows: [row("usage_events"), row("email_send_log")],
    now: NOW,
    onlyDatasets: ["usage_events"],
  });
  assertEquals(planned.length, 1);
  assertEquals(planned[0].dataset_key, "usage_events");
  assertEquals(skipped[0].dataset_key, "email_send_log");
  assertEquals(skipped[0].reason, "filter_not_requested");
});

Deno.test("consent_events anonymize plan carries the PII column list", () => {
  const { planned } = buildPlan({
    rows: [row("consent_events", { strategy: "anonymize", retention_days: 365 })],
    now: NOW,
  });
  assertEquals(planned[0].strategy, "anonymize");
  assertEquals(planned[0].anonymize_nulls, ["ip_hash", "user_agent", "metadata", "user_id"]);
  // The extra filter ensures we only touch rows that still hold PII (idempotent).
  assertEquals(planned[0].extra_filter?.column, "ip_hash");
  assertEquals(planned[0].extra_filter?.op, "not.is");
});

Deno.test("DATASET_MAP covers every dataset seeded in retention_config", () => {
  // Mirrors the seed in the retention_config migration. If you add a new
  // seeded dataset, add it here AND in DATASET_MAP, or the runner will skip it.
  const expected = [
    "consent_events",
    "usage_events",
    "email_send_log",
    "cleanup_logs",
  ];
  for (const key of expected) {
    assert(DATASET_MAP[key], `DATASET_MAP missing ${key}`);
  }
});

Deno.test("clampBatchSize defaults and caps", () => {
  assertEquals(clampBatchSize(undefined), DEFAULT_BATCH_SIZE);
  assertEquals(clampBatchSize(0), DEFAULT_BATCH_SIZE);
  assertEquals(clampBatchSize(50), 50);
  assertEquals(clampBatchSize(MAX_BATCH_SIZE + 1), MAX_BATCH_SIZE);
});
