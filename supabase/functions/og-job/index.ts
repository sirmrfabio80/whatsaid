// Public OG image generator for shared transcripts.
// Fetches a transcript_share by token, then renders a 1200x630 PNG with
// the job title + duration + WhatSaid brand. SVG → PNG via @resvg/resvg-js.
//
// verify_jwt = false (configured in supabase/config.toml).
// Cached aggressively at the CDN — the image is deterministic per token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
// deno-lint-ignore-file no-explicit-any
import { Resvg } from "npm:@resvg/resvg-js@2.6.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDuration(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return "—";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

/** Word-wrap a title into up to maxLines, truncating with ellipsis. */
function wrapTitle(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length === maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }
  // Truncate last line with ellipsis if more text remains
  const totalRendered = lines.join(" ").length;
  if (totalRendered < text.length) {
    const last = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] =
      last.length > maxCharsPerLine - 1
        ? `${last.slice(0, maxCharsPerLine - 1)}…`
        : `${last}…`;
  }
  return lines;
}

function buildSvg(title: string, durationLabel: string): string {
  const titleLines = wrapTitle(title || "Untitled transcript", 26, 3);
  const lineHeight = 86;
  const startY = 280 - ((titleLines.length - 1) * lineHeight) / 2;

  const titleTspans = titleLines
    .map(
      (line, i) =>
        `<tspan x="80" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  // Brand color: hsl(245 50% 48%) ≈ #473DB8
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a3098"/>
      <stop offset="100%" stop-color="#5446c8"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Decorative wave bars -->
  <g opacity="0.12" fill="#ffffff">
    ${Array.from({ length: 30 })
      .map((_, i) => {
        const x = 60 + i * 12;
        const h = 20 + Math.abs(Math.sin(i * 0.7)) * 60;
        const y = 540 - h / 2;
        return `<rect x="${x}" y="${y}" width="6" height="${h}" rx="3"/>`;
      })
      .join("")}
    ${Array.from({ length: 30 })
      .map((_, i) => {
        const x = 760 + i * 12;
        const h = 16 + Math.abs(Math.cos(i * 0.5)) * 70;
        const y = 540 - h / 2;
        return `<rect x="${x}" y="${y}" width="6" height="${h}" rx="3"/>`;
      })
      .join("")}
  </g>

  <!-- Brand pill (top-left): icon + WhatSaid -->
  <g transform="translate(80, 70)">
    <rect x="0" y="0" width="56" height="56" rx="14" fill="#ffffff" opacity="0.15"/>
    <!-- Speech bubble + waveform -->
    <g transform="translate(10, 10)" stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 14 Q3 4 18 4 Q33 4 33 14 Q33 24 18 24 L13 24 L9 30 L11 24 Q3 22 3 14 Z"/>
      <line x1="11" y1="14" x2="11" y2="18"/>
      <line x1="15" y1="9" x2="15" y2="22"/>
      <line x1="19" y1="6" x2="19" y2="25"/>
      <line x1="23" y1="10" x2="23" y2="20"/>
      <line x1="27" y1="13" x2="27" y2="17"/>
    </g>
    <text x="72" y="38" fill="#ffffff" font-family="Inter, system-ui, sans-serif" font-size="28" font-weight="700">WhatSaid</text>
  </g>

  <!-- Title -->
  <text fill="#ffffff" font-family="Inter, system-ui, sans-serif" font-size="68" font-weight="800">
    ${titleTspans}
  </text>

  <!-- Duration chip -->
  <g transform="translate(80, 470)">
    <rect x="0" y="0" width="${260 + durationLabel.length * 8}" height="60" rx="30" fill="#ffffff" opacity="0.14"/>
    <g transform="translate(22, 18)" stroke="#ffffff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12,6 12,12 16,14"/>
    </g>
    <text x="56" y="40" fill="#ffffff" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="600">
      ${escapeXml(`Duration · ${durationLabel}`)}
    </text>
  </g>

  <!-- Footer label -->
  <text x="1120" y="595" text-anchor="end" fill="#ffffff" opacity="0.7"
        font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="500">
    AI Audio Transcription with Speaker Labels
  </text>
</svg>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
      return new Response("Invalid token", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the share → job
    const { data: share, error: shareErr } = await supabase
      .from("transcript_shares")
      .select("job_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    let title = "Shared transcript";
    let durationSec: number | null = null;

    if (!shareErr && share?.job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("title, file_name, duration_seconds")
        .eq("id", share.job_id)
        .maybeSingle();

      if (job) {
        title = (job.title || job.file_name || title).slice(0, 140);
        durationSec = job.duration_seconds ?? null;
      }
    }

    const svg = buildSvg(title, formatDuration(durationSec));

    const resvg = new Resvg(svg, {
      background: "rgba(0,0,0,0)",
      fitTo: { mode: "width", value: 1200 },
      font: {
        loadSystemFonts: false,
        defaultFontFamily: "Inter",
      },
    });
    const png = resvg.render().asPng();

    return new Response(png, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        // Cache: per-token image is stable; allow CDN to serve crawlers fast.
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (e) {
    console.error("og-job error", e);
    return new Response("Failed to render OG image", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
