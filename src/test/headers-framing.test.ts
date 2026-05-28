import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard: the Lovable editor embeds the preview in an iframe from
 * lovable.dev / *.lovable.app / *.lovableproject.com. If we ever re-introduce
 * `X-Frame-Options: DENY|SAMEORIGIN` on the SPA, or strip the Lovable origins
 * from CSP `frame-ancestors`, the in-editor preview goes blank.
 *
 * This test parses `public/_headers` and fails the build if framing is
 * blocked for those origins.
 */

const REQUIRED_FRAME_ANCESTOR_HOSTS = [
  "lovable.app",
  "lovableproject.com",
  "lovable.dev",
];

interface HeaderBlock {
  path: string;
  headers: Array<{ name: string; value: string }>;
}

function parseHeadersFile(content: string): HeaderBlock[] {
  const blocks: HeaderBlock[] = [];
  let current: HeaderBlock | null = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line || line.trimStart().startsWith("#")) continue;
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      if (current) blocks.push(current);
      current = { path: line.trim(), headers: [] };
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    current.headers.push({
      name: line.slice(0, idx).trim().toLowerCase(),
      value: line.slice(idx + 1).trim(),
    });
  }
  if (current) blocks.push(current);
  return blocks;
}

function getHeader(block: HeaderBlock, name: string): string | undefined {
  return block.headers.find((h) => h.name === name.toLowerCase())?.value;
}

function frameAncestorsFromCsp(csp: string): string[] | null {
  const directive = csp
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.toLowerCase().startsWith("frame-ancestors"));
  if (!directive) return null;
  return directive.split(/\s+/).slice(1);
}

describe("public/_headers — Lovable preview framing guard", () => {
  const filePath = resolve(__dirname, "../../public/_headers");
  const content = readFileSync(filePath, "utf8");
  const blocks = parseHeadersFile(content);

  // The block that applies broadly to the SPA. `/*` is the canonical SPA
  // fallback in the Cloudflare/Netlify headers format.
  const wildcardBlock = blocks.find((b) => b.path === "/*");

  it("has a wildcard /* header block", () => {
    expect(wildcardBlock, "Expected a `/*` block in public/_headers").toBeDefined();
  });

  it("does NOT set X-Frame-Options to DENY or SAMEORIGIN on the SPA", () => {
    if (!wildcardBlock) return;
    const xfo = getHeader(wildcardBlock, "x-frame-options");
    if (xfo) {
      expect(
        /^(deny|sameorigin)$/i.test(xfo.trim()),
        `X-Frame-Options=${xfo} blocks the Lovable preview iframe. Use CSP frame-ancestors instead.`,
      ).toBe(false);
    }
  });

  it("CSP frame-ancestors (enforced or report-only) allows Lovable preview origins", () => {
    if (!wildcardBlock) return;
    const csp =
      getHeader(wildcardBlock, "content-security-policy") ??
      getHeader(wildcardBlock, "content-security-policy-report-only");
    expect(csp, "Expected a CSP header on the /* block").toBeDefined();
    const ancestors = frameAncestorsFromCsp(csp!);
    expect(ancestors, "CSP must declare a frame-ancestors directive").not.toBeNull();
    expect(
      ancestors!.includes("'none'"),
      "frame-ancestors 'none' blocks the Lovable preview iframe",
    ).toBe(false);
    for (const host of REQUIRED_FRAME_ANCESTOR_HOSTS) {
      expect(
        ancestors!.some((src) => src.includes(host)),
        `frame-ancestors must allow ${host} so the Lovable editor can embed the preview`,
      ).toBe(true);
    }
  });
});
