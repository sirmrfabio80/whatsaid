import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateAlerts,
  HIGH_CANDIDATES_THRESHOLD,
  SPIKE_MIN_HISTORY,
  type HistoricalRun,
  type RunReport,
} from "./retention-alerts.ts";

function baseRun(overrides: Partial<RunReport> = {}): RunReport {
  return {
    run_id: "r1",
    job_name: "prune-retention",
    mode: "live",
    status: "ok",
    datasets: [],
    ...overrides,
  };
}

Deno.test("clean live run produces no alerts", () => {
  const alerts = evaluateAlerts(baseRun({
    datasets: [{ dataset_key: "cleanup_logs", candidates: 12, processed: 12, status: "ok" }],
  }), []);
  assertEquals(alerts.length, 0);
});

Deno.test("dataset with error -> run_failed", () => {
  const alerts = evaluateAlerts(baseRun({
    status: "failed",
    datasets: [{ dataset_key: "cleanup_logs", error: "permission denied", status: "failed" }],
  }), []);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].kind, "run_failed");
});

Deno.test("candidates > 10000 -> high_candidates per dataset", () => {
  const alerts = evaluateAlerts(baseRun({
    datasets: [
      { dataset_key: "consent_events", candidates: HIGH_CANDIDATES_THRESHOLD + 1, processed: 1000 },
      { dataset_key: "cleanup_logs", candidates: 50, processed: 50 },
    ],
  }), []);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].kind, "high_candidates");
  assertEquals(alerts[0].dataset_key, "consent_events");
});

Deno.test("processed spike >10x median triggers large_processed_jump (live, enough history)", () => {
  const history: HistoricalRun[] = Array.from({ length: SPIKE_MIN_HISTORY }, () => ({
    job_name: "prune-retention",
    metadata: { datasets: [{ dataset_key: "cleanup_logs", processed: 10 }] },
  }));
  const alerts = evaluateAlerts(baseRun({
    datasets: [{ dataset_key: "cleanup_logs", candidates: 200, processed: 150 }],
  }), history);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].kind, "large_processed_jump");
});

Deno.test("dry-run does not trigger processed spike", () => {
  const history: HistoricalRun[] = Array.from({ length: SPIKE_MIN_HISTORY }, () => ({
    job_name: "prune-retention",
    metadata: { datasets: [{ dataset_key: "cleanup_logs", processed: 10 }] },
  }));
  const alerts = evaluateAlerts(baseRun({
    mode: "dry-run",
    datasets: [{ dataset_key: "cleanup_logs", candidates: 200, processed: 500 }],
  }), history);
  assertEquals(alerts.filter((a) => a.kind === "large_processed_jump").length, 0);
});

Deno.test("thin history (<10 live runs) suppresses spike alerts", () => {
  const history: HistoricalRun[] = Array.from({ length: 3 }, () => ({
    job_name: "prune-retention",
    metadata: { datasets: [{ dataset_key: "cleanup_logs", processed: 10 }] },
  }));
  const alerts = evaluateAlerts(baseRun({
    datasets: [{ dataset_key: "cleanup_logs", candidates: 200, processed: 500 }],
  }), history);
  assertEquals(alerts.filter((a) => a.kind === "large_processed_jump").length, 0);
});

Deno.test("median 0 history suppresses spike (avoids first-real-run noise)", () => {
  const history: HistoricalRun[] = Array.from({ length: SPIKE_MIN_HISTORY }, () => ({
    job_name: "prune-retention",
    metadata: { datasets: [{ dataset_key: "cleanup_logs", processed: 0 }] },
  }));
  const alerts = evaluateAlerts(baseRun({
    datasets: [{ dataset_key: "cleanup_logs", candidates: 5, processed: 5 }],
  }), history);
  assertEquals(alerts.filter((a) => a.kind === "large_processed_jump").length, 0);
});
