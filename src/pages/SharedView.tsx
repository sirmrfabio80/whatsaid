import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Shield, Mail, AlertTriangle, Clock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/use-page-meta";

type Stage =
  | "init"
  | "requesting"
  | "awaitingCode"
  | "verifying"
  | "loading"
  | "viewing"
  | "expired"
  | "notFound"
  | "error";

interface FetchedContent {
  title: string;
  sender_label: string;
  transcript: string;
  summary: string | null;
  questions: { prompt: string | null; answer: string }[];
  language: string;
  expires_at: string;
  notice: { version: string; text_en: string } | null;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SESSION_STORAGE_PREFIX = "share-view-session:";
const NOTICE_ACK_PREFIX = "share-view-notice-ack:";

interface FnResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  raw: any;
}

async function callFn<T>(name: string, body: unknown): Promise<FnResult<T>> {
  try {
    const res = await fetch(`${FN_BASE}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: json?.error || `http_${res.status}`, raw: json };
    }
    return { ok: true, status: res.status, data: json as T, error: null, raw: json };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: "network_error", raw: null };
  }
}


function formatSection(content: string): JSX.Element[] {
  // Lightweight renderer for transcript lines like "Speaker: text"
  return content.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;
    const match = trimmed.match(/^([^:]{1,40}):\s*(.*)$/);
    if (match) {
      return (
        <p key={i} className="text-sm leading-relaxed mb-1">
          <span className="font-semibold text-primary">{match[1]}:</span>{" "}
          <span className="text-foreground/80">{match[2]}</span>
        </p>
      );
    }
    return <p key={i} className="text-sm leading-relaxed text-foreground/80 mb-1">{trimmed}</p>;
  });
}

function formatMarkdownish(content: string): JSX.Element[] {
  const lines = content.split("\n");
  const out: JSX.Element[] = [];
  let listBuffer: string[] = [];
  const flushList = (key: string) => {
    if (listBuffer.length) {
      out.push(
        <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 mb-3 text-sm text-foreground/80">
          {listBuffer.map((li, i) => <li key={i}>{li}</li>)}
        </ul>
      );
      listBuffer = [];
    }
  };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("## ")) { flushList(`${i}`); out.push(<h3 key={i} className="text-base font-semibold mt-4 mb-2 text-foreground">{t.slice(3)}</h3>); }
    else if (t.startsWith("### ")) { flushList(`${i}`); out.push(<h4 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground">{t.slice(4)}</h4>); }
    else if (t.startsWith("- ") || t.startsWith("• ")) listBuffer.push(t.slice(2));
    else if (t === "") flushList(`${i}`);
    else { flushList(`${i}`); out.push(<p key={i} className="text-sm leading-relaxed text-foreground/80 mb-2">{t}</p>); }
  });
  flushList("end");
  return out;
}

export default function SharedView() {
  const { token } = useParams<{ token: string }>();
  usePageMeta({ title: "Shared transcript — WhatSaid", noindex: true, robots: "noindex,nofollow" });

  const [stage, setStage] = useState<Stage>("init");
  const [code, setCode] = useState("");
  const [recipientHint, setRecipientHint] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [content, setContent] = useState<FetchedContent | null>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeAcking, setNoticeAcking] = useState(false);
  const sessionKey = useMemo(() => `${SESSION_STORAGE_PREFIX}${token}`, [token]);
  const noticeAckKey = useMemo(() => `${NOTICE_ACK_PREFIX}${token}`, [token]);
  const attemptedAutoFetch = useRef(false);

  // Cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Try existing session on mount
  useEffect(() => {
    if (!token || attemptedAutoFetch.current) return;
    attemptedAutoFetch.current = true;
    const stored = sessionStorage.getItem(sessionKey);
    if (stored) {
      void fetchContent(stored);
    }
  }, [token, sessionKey]);

  const fetchContent = async (session: string) => {
    setStage("loading");
    const res = await callFn<FetchedContent>("share-view-fetch", { token, session });
    if (!res.ok) {
      sessionStorage.removeItem(sessionKey);
      if (res.error === "expired") { setStage("expired"); return; }
      if (res.error === "not_found" || res.error === "job_not_found") { setStage("notFound"); return; }
      if (res.error === "invalid_session") { setStage("init"); return; }
      setErrorMsg(res.error);
      setStage("error");
      return;
    }
    setContent(res.data);
    setStage("viewing");
    if (res.data?.notice && !sessionStorage.getItem(noticeAckKey)) {
      setNoticeOpen(true);
    }
  };

  const ackNotice = async () => {
    const sess = sessionStorage.getItem(sessionKey);
    if (!token || !sess) {
      setNoticeOpen(false);
      return;
    }
    setNoticeAcking(true);
    try {
      const res = await callFn<{ ok: boolean }>("share-view-ack-notice", { token, session: sess });
      if (res.ok) {
        sessionStorage.setItem(noticeAckKey, "1");
      }
    } finally {
      setNoticeAcking(false);
      setNoticeOpen(false);
    }
  };

  const requestCode = async () => {
    if (!token) return;
    setStage("requesting");
    setErrorMsg("");
    const res = await callFn<{ recipient_hint: string; expires_in: number }>("share-view-request-otp", { token });
    if (!res.ok) {
      if (res.error === "expired") { setStage("expired"); return; }
      if (res.error === "not_found") { setStage("notFound"); return; }
      if (res.error === "cooldown") {
        const secs = res.raw?.retry_after_seconds ?? 30;
        setResendCooldown(secs);
        setStage("awaitingCode");
        toast.error(`Please wait ${secs}s before requesting another code.`);
        return;
      }
      setErrorMsg(res.error);
      setStage("error");
      return;
    }
    setRecipientHint(res.data.recipient_hint);
    setResendCooldown(30);
    setStage("awaitingCode");
    toast.success("Code sent. Check your inbox.");
  };

  const verifyCode = async () => {
    if (!token || !/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code from the email.");
      return;
    }
    setStage("verifying");
    const res = await callFn<{ session: string; expires_at: string }>("share-view-verify-otp", {
      token,
      code,
    });
    if (!res.ok) {
      if (res.error === "expired") { setStage("expired"); return; }
      if (res.error === "not_found") { setStage("notFound"); return; }
      if (res.error === "invalid_code") {
        const rem = res.raw?.attempts_remaining;
        setAttemptsRemaining(typeof rem === "number" ? rem : null);
        setStage("awaitingCode");
        toast.error(typeof rem === "number" ? `Incorrect code. ${rem} attempts left.` : "Incorrect code.");
        return;
      }
      if (res.error === "too_many_attempts") {
        setStage("awaitingCode");
        setAttemptsRemaining(0);
        toast.error("Too many attempts. Request a new code.");
        return;
      }
      if (res.error === "code_expired" || res.error === "no_active_code") {
        setStage("awaitingCode");
        toast.error("Code expired. Request a new one.");
        return;
      }
      setErrorMsg(res.error);
      setStage("error");
      return;
    }
    sessionStorage.setItem(sessionKey, res.data.session);
    setCode("");
    await fetchContent(res.data.session);
  };

  if (!token) {
    return (
      <div className="container mx-auto max-w-xl py-12 px-4">
        <Card><CardContent className="p-8 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Invalid link</h1>
        </CardContent></Card>
      </div>
    );
  }

  if (stage === "expired") {
    return (
      <div className="container mx-auto max-w-xl py-12 px-4">
        <Card><CardContent className="p-8 text-center space-y-3">
          <Clock className="h-10 w-10 text-muted-foreground mx-auto" />
          <h1 className="text-xl font-semibold">This share link has expired</h1>
          <p className="text-sm text-muted-foreground">Share links are valid for 2 days. Ask the sender to share again.</p>
          <Button asChild variant="outline"><Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Back home</Link></Button>
        </CardContent></Card>
      </div>
    );
  }

  if (stage === "notFound") {
    return (
      <div className="container mx-auto max-w-xl py-12 px-4">
        <Card><CardContent className="p-8 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Share not found</h1>
          <p className="text-sm text-muted-foreground">This link may be incorrect or has been revoked.</p>
        </CardContent></Card>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="container mx-auto max-w-xl py-12 px-4">
        <Card><CardContent className="p-8 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">{errorMsg || "Please try again in a moment."}</p>
          <Button onClick={() => { setStage("init"); setErrorMsg(""); }}>Try again</Button>
        </CardContent></Card>
      </div>
    );
  }

  if (stage === "viewing" && content) {
    return (
      <>
      <div className="container mx-auto max-w-3xl py-8 px-4 space-y-6" aria-hidden={noticeOpen ? "true" : undefined}>
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Shared with you</p>
          <h1 className="text-2xl font-bold text-foreground">{content.title}</h1>
          <p className="text-sm text-muted-foreground">From {content.sender_label}</p>
        </header>

        {content.summary && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-3">Summary</h2>
              {formatMarkdownish(content.summary)}
            </CardContent>
          </Card>
        )}

        {content.questions.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-3">Questions & answers</h2>
              <div className="space-y-3">
                {content.questions.map((q, i) => (
                  <div key={i} className="rounded-md bg-muted/40 p-3">
                    <p className="text-sm font-semibold text-primary mb-1">Q: {q.prompt || "—"}</p>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap">{q.answer}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-3">Transcript</h2>
            <div>{formatSection(content.transcript)}</div>
          </CardContent>
        </Card>

        {content.notice && (
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">UK GDPR privacy notice</p>
              <div className="space-y-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{content.notice.text_en}</div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Link expires {new Date(content.expires_at).toLocaleString()}.
        </p>
      </div>

      <Dialog
        open={noticeOpen}
        onOpenChange={(open) => {
          // Block dismissal until acknowledged; the only exit is the button below.
          if (!open && !noticeAcking) ackNotice();
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>UK GDPR privacy notice</DialogTitle>
            <DialogDescription className="sr-only">
              Information about how your personal data in this shared transcript is handled.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3 text-sm text-foreground/80 whitespace-pre-line">
            {content.notice?.text_en ?? ""}
          </div>
          <DialogFooter>
            <Button onClick={ackNotice} disabled={noticeAcking} className="w-full sm:w-auto">
              {noticeAcking ? <InlineSpinner className="h-4 w-4 mr-2" /> : null}
              I understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    );
  }


  // init / requesting / awaitingCode / verifying / loading — gate UI
  const busy = stage === "requesting" || stage === "verifying" || stage === "loading";

  return (
    <div className="container mx-auto max-w-md py-12 px-4">
      <Card>
        <CardContent className="p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold">View shared transcript</h1>
            <p className="text-sm text-muted-foreground">
              For privacy, we send a one-time code to the address this link was shared with.
            </p>
          </div>

          {stage === "init" || stage === "loading" ? (
            <Button onClick={requestCode} disabled={busy} className="w-full">
              {busy ? <InlineSpinner className="h-4 w-4 mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              {stage === "loading" ? "Checking…" : "Send me a code"}
            </Button>
          ) : (
            <>
              {recipientHint && (
                <p className="text-xs text-muted-foreground text-center">
                  Code sent to <span className="font-medium">{recipientHint}</span>
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="otp-code">Enter the 6-digit code</Label>
                <Input
                  id="otp-code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.4em] font-mono"
                  disabled={busy}
                />
                {attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <p className="text-xs text-muted-foreground">{attemptsRemaining} attempts remaining</p>
                )}
              </div>
              <div className="space-y-2">
                <Button onClick={verifyCode} disabled={busy || code.length !== 6} className="w-full">
                  {stage === "verifying" ? <InlineSpinner className="h-4 w-4 mr-2" /> : null}
                  Verify and view
                </Button>
                <Button
                  variant="outline"
                  onClick={requestCode}
                  disabled={busy || resendCooldown > 0}
                  className="w-full"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </Button>
              </div>
            </>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Codes expire after 10 minutes. Share link expires 2 days after it was sent.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
