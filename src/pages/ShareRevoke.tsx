import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { Shield, CheckCircle2, AlertTriangle, FileJson, FileText, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePageMeta } from "@/hooks/use-page-meta";
import { toast } from "sonner";

const MAX_REASON_LENGTH = 500;

type Stage = "confirm" | "working" | "revoked" | "already" | "notFound" | "invalid" | "error";
type AuditFormat = "json" | "txt" | "pdf";

type AuditPayload = {
  site: { name: string; url: string };
  share: {
    id: string;
    job_id: string;
    job_title: string;
    recipient_email: string;
    created_at: string | null;
    expires_at: string | null;
    last_viewed_at: string | null;
    email_in_body: boolean | null;
  };
  revocation: {
    revoked_at: string | null;
    revoke_reason: string | null;
    revoked_by_label: string | null;
  };
  generated_at: string;
};

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderAuditPdf(p: AuditPayload): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const lineHeight = 16;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${p.site.name} — Share audit log`, margin, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Generated ${new Date(p.generated_at).toLocaleString()}`, margin, y);
  doc.setTextColor(0);
  y += lineHeight * 1.5;

  const section = (title: string, rows: Array<[string, string]>) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, margin, y);
    y += lineHeight;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    for (const [k, v] of rows) {
      doc.setTextColor(110);
      doc.text(k, margin, y);
      doc.setTextColor(0);
      const wrapped = doc.splitTextToSize(v || "—", 380);
      doc.text(wrapped, margin + 150, y);
      y += lineHeight * Math.max(1, wrapped.length);
    }
    y += lineHeight * 0.5;
  };

  section("Share", [
    ["Share ID", p.share.id],
    ["Job", `${p.share.job_title} (${p.share.job_id})`],
    ["Recipient", p.share.recipient_email],
    ["Created", fmtDate(p.share.created_at)],
    ["Expires", fmtDate(p.share.expires_at)],
    ["Last successful view", fmtDate(p.share.last_viewed_at)],
    ["Email-in-body", p.share.email_in_body ? "Yes" : "No"],
  ]);

  section("Revocation", [
    ["Revoked at", fmtDate(p.revocation.revoked_at)],
    ["Revoked by", p.revocation.revoked_by_label ?? "—"],
    ["Reason", p.revocation.revoke_reason ?? "—"],
  ]);

  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(p.site.url, margin, 820);

  return doc.output("blob");
}

export default function ShareRevoke() {
  const [params] = useSearchParams();
  const token = (params.get("token") ?? "").trim();
  const [stage, setStage] = useState<Stage>("confirm");
  const [reason, setReason] = useState("");
  const [downloading, setDownloading] = useState<AuditFormat | null>(null);

  usePageMeta({
    title: "Revoke shared transcript · WhatSaid",
    description: "Immediately revoke access to a transcript that was shared with you.",
    robots: "noindex, nofollow",
  });

  useEffect(() => {
    if (!/^[a-f0-9]{64}$/i.test(token)) setStage("invalid");
  }, [token]);

  const revoke = async () => {
    setStage("working");
    try {
      const trimmed = reason.trim().slice(0, MAX_REASON_LENGTH);
      const { data, error } = await supabase.functions.invoke("share-revoke", {
        body: { token, reason: trimmed || undefined },
      });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 404) return setStage("notFound");
        if (status === 400) return setStage("invalid");
        return setStage("error");
      }
      if (data?.alreadyRevoked) return setStage("already");
      return setStage("revoked");
    } catch {
      setStage("error");
    }
  };

  const downloadAudit = async (format: AuditFormat) => {
    if (downloading) return;
    setDownloading(format);
    try {
      const { data, error } = await supabase.functions.invoke<AuditPayload>(
        "share-audit-log",
        { body: { token, format: "json" } },
      );
      if (error || !data) {
        toast.error("Couldn't download the audit log.");
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const base = `whatsaid-share-audit-${data.share.id}-${stamp}`;

      if (format === "json") {
        triggerDownload(
          `${base}.json`,
          new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        );
      } else if (format === "txt") {
        const lines = [
          `${data.site.name} — Share audit log`,
          data.site.url,
          "",
          `Generated:            ${data.generated_at}`,
          "",
          "— Share —",
          `Share ID:             ${data.share.id}`,
          `Job:                  ${data.share.job_title} (${data.share.job_id})`,
          `Recipient:            ${data.share.recipient_email}`,
          `Created:              ${fmtDate(data.share.created_at)}`,
          `Expires:              ${fmtDate(data.share.expires_at)}`,
          `Last successful view: ${fmtDate(data.share.last_viewed_at)}`,
          `Email-in-body:        ${data.share.email_in_body ? "yes" : "no"}`,
          "",
          "— Revocation —",
          `Revoked at:           ${fmtDate(data.revocation.revoked_at)}`,
          `Revoked by:           ${data.revocation.revoked_by_label ?? "—"}`,
          `Reason:               ${data.revocation.revoke_reason ?? "—"}`,
          "",
        ].join("\n");
        triggerDownload(
          `${base}.txt`,
          new Blob([lines], { type: "text/plain;charset=utf-8" }),
        );
      } else {
        const pdf = await renderAuditPdf(data);
        triggerDownload(`${base}.pdf`, pdf);
      }
      toast.success("Audit log downloaded.");
    } catch {
      toast.error("Couldn't download the audit log.");
    } finally {
      setDownloading(null);
    }
  };

  const tokenValid = /^[a-f0-9]{64}$/i.test(token);
  const canDownload =
    tokenValid && (stage === "confirm" || stage === "revoked" || stage === "already");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2"><Shield className="h-5 w-5 text-primary" /></div>
            <h1 className="text-xl font-semibold">Revoke transcript access</h1>
          </div>

          {stage === "invalid" && (
            <p className="text-sm text-muted-foreground">
              This revocation link is invalid or malformed. If you received this link by email, please use the original link from that email.
            </p>
          )}

          {stage === "notFound" && (
            <p className="text-sm text-muted-foreground">
              We couldn't find a share matching this link. It may have already been deleted.
            </p>
          )}

          {stage === "confirm" && (
            <>
              <p className="text-sm text-muted-foreground">
                Revoking will immediately stop this transcript from being viewable. The link will return a "revoked" page to anyone who tries to open it. This cannot be undone.
              </p>
              <div className="space-y-2">
                <Label htmlFor="revoke-reason" className="text-sm">
                  Reason <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="revoke-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
                  placeholder="e.g. Sent to the wrong person, contains outdated info…"
                  maxLength={MAX_REASON_LENGTH}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {reason.length}/{MAX_REASON_LENGTH}
                </p>
              </div>
              <Button onClick={revoke} className="w-full">Revoke access now</Button>
              <p className="text-xs text-muted-foreground">
                You don't need an account to do this — knowing this link is enough. Your reason will be shown to anyone who opens the revoked link.
              </p>
            </>
          )}

          {stage === "working" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <InlineSpinner /> Revoking…
            </div>
          )}

          {stage === "revoked" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" /> Access revoked
              </div>
              <p className="text-sm text-muted-foreground">
                The share link no longer works. Cached copies already downloaded by recipients cannot be recalled.
              </p>
            </div>
          )}

          {stage === "already" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-5 w-5 text-green-600" /> Already revoked
              </div>
              <p className="text-sm text-muted-foreground">This share was already revoked. No further action is needed.</p>
            </div>
          )}

          {stage === "error" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-5 w-5" /> Something went wrong
              </div>
              <Button variant="outline" onClick={revoke} className="w-full">Try again</Button>
            </div>
          )}

          {canDownload && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">
                Audit log
              </p>
              <p className="text-xs text-muted-foreground">
                Download a record of this share including expiration, revocation, and last successful view.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!!downloading}
                  onClick={() => downloadAudit("json")}
                >
                  {downloading === "json" ? <InlineSpinner /> : <FileJson className="h-3.5 w-3.5" />}
                  JSON
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!!downloading}
                  onClick={() => downloadAudit("txt")}
                >
                  {downloading === "txt" ? <InlineSpinner /> : <FileText className="h-3.5 w-3.5" />}
                  TXT
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!!downloading}
                  onClick={() => downloadAudit("pdf")}
                >
                  {downloading === "pdf" ? <InlineSpinner /> : <FileDown className="h-3.5 w-3.5" />}
                  PDF
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to WhatSaid</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
