import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNoticeHtml,
  buildNoticeText,
  hashRecipientEmail,
  type NoticeContext,
  type ResolvedNotice,
} from "./recipient-notice.ts";

Deno.env.set("CONSENT_IP_SALT_SECRET", "test-salt");

const NOTICE: ResolvedNotice = {
  version: "share_recipient_notice.2026-05-v1",
  text_en:
    "Controller. The sender is the controller.\n\nPersonal data involved. Voice recording, transcript, summary.\n\nSource. Audio uploaded by the sender.\n\nPurposes and lawful basis. The sender's stated purpose under UK GDPR Article 6.\n\nRecipients. Only this named recipient.\n\nRetention. Transcript retained per WhatSaid schedule.\n\nYour rights. Access, rectification, erasure, complaint to the UK ICO.",
};

const CTX: NoticeContext = {
  senderLabel: "Jane Doe",
  senderEmail: "jane@example.com",
  jobShortId: "abc123",
};

Deno.test("buildNoticeHtml contains the seven Art. 14 markers", () => {
  const html = buildNoticeHtml(NOTICE, CTX);
  assertStringIncludes(html.toLowerCase(), "controller");
  assertStringIncludes(html.toLowerCase(), "purpose");
  assertStringIncludes(html.toLowerCase(), "basis");
  assertStringIncludes(html.toLowerCase(), "retention");
  assertStringIncludes(html.toLowerCase(), "rights");
  assertStringIncludes(html.toLowerCase(), "ico");
  assertStringIncludes(html.toLowerCase(), "source");
  assertStringIncludes(html, "mailto:jane@example.com");
  assertStringIncludes(html, "abc123");
});

Deno.test("buildNoticeText mirrors the notice body", () => {
  const text = buildNoticeText(NOTICE, CTX);
  assertStringIncludes(text, "UK GDPR privacy notice");
  assertStringIncludes(text, "Controller");
  assertStringIncludes(text, "ico.org.uk");
  assertStringIncludes(text, "mailto:jane@example.com");
});

Deno.test("hashRecipientEmail is deterministic within the same day and case-insensitive", async () => {
  const a = await hashRecipientEmail("User@Example.com");
  const b = await hashRecipientEmail("user@example.com");
  const c = await hashRecipientEmail(" USER@example.com ");
  assertEquals(a, b);
  assertEquals(a, c);
  assert(a.length === 64, "expected 64-char hex digest");
});

Deno.test("hashRecipientEmail differs for different addresses", async () => {
  const a = await hashRecipientEmail("a@example.com");
  const b = await hashRecipientEmail("b@example.com");
  assert(a !== b);
});
