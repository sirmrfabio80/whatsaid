import { describe, expect, it } from "vitest";
import { buildDsrManifest, JOB_INTERNAL_COLUMNS, type DsrFixtures } from "@/lib/dsr-export-builder";

function emptyFixtures(): DsrFixtures {
  return {
    profile: null,
    creditBalance: null,
    creditTransactions: [],
    consentEvents: [],
    jobs: [],
    jobOutputsByJob: {},
    variantsByOutput: {},
    tagsByJob: {},
    sharesSent: [],
    usageEvents: [],
    notifications: [],
  };
}

describe("buildDsrManifest", () => {
  const meta = { generatedAt: "2026-05-28T10:00:00Z", userId: "u-1", userEmail: "jane@example.com" };

  it("always emits the documented top-level files (Art. 15 access surface)", () => {
    const entries = buildDsrManifest(emptyFixtures(), meta);
    const paths = entries.map((e) => e.path).sort();
    for (const p of [
      "README.txt",
      "consent_history.json",
      "credits.json",
      "notifications.json",
      "profile.json",
      "shares_sent.json",
      "usage_events.json",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("strips service-internal job columns from the export", () => {
    const f = emptyFixtures();
    f.jobs = [{
      id: "job-1",
      user_id: "u-1",
      file_name: "interview.mp3",
      temp_file_path: "/internal/secret-path.mp3",
      assemblyai_transcript_id: "aai_secret_123",
      stripe_payment_id: "pi_secret",
      guest_token: "g_secret",
    }];
    f.jobOutputsByJob["job-1"] = [];
    const entries = buildDsrManifest(f, meta);
    const jobFile = entries.find((e) => e.path === "jobs/job-1/job.json");
    expect(jobFile).toBeDefined();
    for (const col of JOB_INTERNAL_COLUMNS) {
      expect(jobFile!.content).not.toContain(col);
    }
    // But user-facing fields ARE included.
    expect(jobFile!.content).toContain("interview.mp3");
  });

  it("emits transcript.txt + transcript.json when a transcript output exists", () => {
    const f = emptyFixtures();
    f.jobs = [{ id: "job-2" }];
    f.jobOutputsByJob["job-2"] = [
      { id: "o-1", job_id: "job-2", output_type: "transcript", content: "Hello world." },
    ];
    const entries = buildDsrManifest(f, meta);
    const txt = entries.find((e) => e.path === "jobs/job-2/transcript.txt");
    expect(txt?.content).toBe("Hello world.");
    expect(entries.find((e) => e.path === "jobs/job-2/transcript.json")).toBeDefined();
  });

  it("nests variants under their parent custom output", () => {
    const f = emptyFixtures();
    f.jobs = [{ id: "job-3" }];
    f.jobOutputsByJob["job-3"] = [
      { id: "o-9", job_id: "job-3", output_type: "custom", content: "x" },
    ];
    f.variantsByOutput["o-9"] = [{ id: "v-1", job_output_id: "o-9", lang: "fr" }];
    const entries = buildDsrManifest(f, meta);
    const custom = entries.find((e) => e.path === "jobs/job-3/custom_outputs.json");
    expect(custom).toBeDefined();
    expect(custom!.content).toContain("\"lang\": \"fr\"");
  });

  it("README references retention and ICO escalation", () => {
    const entries = buildDsrManifest(emptyFixtures(), meta);
    const readme = entries.find((e) => e.path === "README.txt")!.content;
    expect(readme).toMatch(/7 days/);
    expect(readme).toMatch(/ico\.org\.uk/);
    expect(readme).toContain(meta.userId);
  });
});
