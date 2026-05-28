// Shared helpers for the UK GDPR Art. 14 "told-once" notice that WhatSaid
// sends to recipients of shared transcripts. English-only by design — UK is
// the only supported jurisdiction; other countries require their own
// legally-reviewed copy, not a translation.

import { SITE_NAME, SITE_URL } from "./constants.ts";

export const SHARE_RECIPIENT_NOTICE_TYPE = "share_recipient_notice";

export interface ResolvedNotice {
  version: string;
  text_en: string;
}

export interface NoticeContext {
  senderLabel: string;
  senderEmail: string;
  jobShortId: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ICO_URL = "https://ico.org.uk";
const PRIVACY_ANCHOR = `${SITE_URL}/privacy#share-recipients`;
const FULL_NOTICE_URL = `${SITE_URL}/privacy/share-notice`;

function objectionMailto(ctx: NoticeContext): string {
  const subject = encodeURIComponent(
    `Please remove my voice from the recording shared via ${SITE_NAME} — ${ctx.jobShortId}`,
  );
  const body = encodeURIComponent(
    `Hello,\n\nI received a transcript via ${SITE_NAME} (reference ${ctx.jobShortId}) that includes my voice or personal data. ` +
      `Under UK GDPR I am asking you to stop processing it and delete the recording, transcript and summary you hold about me.\n\nThank you.`,
  );
  return `mailto:${ctx.senderEmail}?subject=${subject}&body=${body}`;
}

// Cache one lookup per function lifetime (cold start clears it).
let cachedNotice: ResolvedNotice | null = null;

export async function resolveActiveNotice(
  serviceClient: { from: (t: string) => any },
): Promise<ResolvedNotice | null> {
  if (cachedNotice) return cachedNotice;
  const { data, error } = await serviceClient
    .from("consent_versions")
    .select("version, text_en, effective_from, effective_to, consent_type")
    .eq("consent_type", SHARE_RECIPIENT_NOTICE_TYPE)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || !data.text_en) return null;
  const now = Date.now();
  if (data.effective_from && new Date(data.effective_from).getTime() > now) return null;
  if (data.effective_to && new Date(data.effective_to).getTime() < now) return null;
  cachedNotice = { version: data.version, text_en: data.text_en };
  return cachedNotice;
}

// Pure builders — exported for unit tests.
export function buildNoticeHtml(notice: ResolvedNotice, ctx: NoticeContext): string {
  const mailto = objectionMailto(ctx);
  const paragraphs = notice.text_en
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="font-size:12px;color:hsl(220,10%,40%);line-height:1.55;margin:0 0 10px;">${escapeHtml(p)}</p>`,
    )
    .join("\n");

  return `<section aria-label="Privacy information" style="margin:24px 0 0;padding:18px 20px;background:hsl(220,20%,98%);border:1px solid hsl(220,15%,90%);border-radius:12px;">
  <p style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:hsl(220,10%,35%);margin:0 0 10px;">UK GDPR privacy notice</p>
  ${paragraphs}
  <p style="font-size:12px;color:hsl(220,10%,40%);line-height:1.55;margin:12px 0 0;">
    To object or ask the sender to delete this recording:
    <a href="${escapeHtml(mailto)}" style="color:hsl(245,50%,48%);text-decoration:underline;">email the sender</a>.
    Read the full notice at <a href="${FULL_NOTICE_URL}" style="color:hsl(245,50%,48%);text-decoration:underline;">${FULL_NOTICE_URL}</a>.
    Contact the UK ICO at <a href="${ICO_URL}" style="color:hsl(245,50%,48%);text-decoration:underline;">${ICO_URL}</a>.
  </p>
</section>`;
}

export function buildNoticeText(notice: ResolvedNotice, ctx: NoticeContext): string {
  return [
    "",
    "--- UK GDPR privacy notice ---",
    "",
    notice.text_en,
    "",
    `Object / ask the sender to delete: ${objectionMailto(ctx)}`,
    `Full notice: ${FULL_NOTICE_URL}`,
    `UK ICO: ${ICO_URL}`,
  ].join("\n");
}

// HMAC-SHA256 with daily-rotated salt — same approach as record-consent.
export async function hashRecipientEmail(email: string): Promise<string> {
  const secret = Deno.env.get("CONSENT_IP_SALT_SECRET") ?? "missing-salt";
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`recipient-email|${day}|${email.toLowerCase().trim()}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface RecordNotificationParams {
  jobId: string;
  sharedBy: string;
  recipientEmail: string;
  channel: "share_transcript" | "share_transcript_record";
  notice: ResolvedNotice;
  messageId?: string;
}

/**
 * Inserts an audit row. Returns true when a new row was created (first
 * notification for this job/recipient/version) and false when the
 * `(job, hash, version)` unique constraint short-circuits the insert
 * because we already told this person on a previous send.
 */
export async function recordRecipientNotification(
  serviceClient: { from: (t: string) => any },
  params: RecordNotificationParams,
): Promise<boolean> {
  const hash = await hashRecipientEmail(params.recipientEmail);
  const { data, error } = await serviceClient
    .from("recipient_notifications")
    .upsert(
      {
        job_id: params.jobId,
        shared_by: params.sharedBy,
        recipient_email_hash: hash,
        channel: params.channel,
        notice_type: SHARE_RECIPIENT_NOTICE_TYPE,
        notice_version: params.notice.version,
        message_id: params.messageId ?? null,
      },
      { onConflict: "job_id,recipient_email_hash,notice_version", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error("[recipient-notice] insert failed", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}
