import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const script = resolve(repoRoot, "scripts/check-capabilities-sources.mjs");

describe("docs/product/capabilities.md", () => {
  it("references only source files that still exist on disk", () => {
    try {
      const stdout = execFileSync("node", [script], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(stdout).toContain("✓");
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      const message = [e.stdout, e.stderr].filter(Boolean).join("\n");
      throw new Error(
        `capabilities.md source-file check failed (exit ${e.status}):\n${message}`,
      );
    }
  });
});
