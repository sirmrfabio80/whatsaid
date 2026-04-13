import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileText, Loader2, XCircle, CheckCircle2 } from "lucide-react";

type DownloadStatus = "loading" | "needsAuth" | "ready" | "downloading" | "done" | "error";

export default function SharedPdfDownload() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const pdfPath = searchParams.get("path") || "";
  const { user, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<DownloadStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!token || !pdfPath) {
      setStatus("error");
      setErrorMsg("This PDF link is not valid.");
      return;
    }

    if (authLoading) return;

    if (!user || !session) {
      setStatus("needsAuth");
      return;
    }

    setStatus("ready");
  }, [token, pdfPath, authLoading, user, session]);

  useEffect(() => {
    if (status === "ready" && !attemptedRef.current) {
      void handleDownload();
    }
  }, [status]);

  const handleDownload = async () => {
    if (!token || !pdfPath || !session) return;
    attemptedRef.current = true;
    setStatus("downloading");

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-shared-pdf`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, pdf_storage_path: pdfPath }),
      });

      if (!response.ok) {
        let message = "Failed to download PDF.";
        try {
          const data = await response.json();
          message = data?.error || message;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] || "transcript.pdf";
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      setStatus("done");
    } catch (error) {
      attemptedRef.current = false;
      setErrorMsg(error instanceof Error ? error.message : "Failed to download PDF.");
      setStatus("error");
    }
  };

  const redirectTarget = `${location.pathname}${location.search}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-6">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Checking secure download access…</p>
            </>
          )}

          {status === "needsAuth" && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold">Sign in to download the PDF</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  For security, shared PDFs are only available to logged-in WhatSaid accounts.
                </p>
              </div>
              <div className="space-y-3">
                <Button onClick={() => navigate(`/login?redirect=${encodeURIComponent(redirectTarget)}`)} className="w-full rounded-xl">
                  Sign in
                </Button>
                <Button onClick={() => navigate(`/signup?redirect=${encodeURIComponent(redirectTarget)}`)} variant="outline" className="w-full rounded-xl">
                  Create account
                </Button>
              </div>
            </>
          )}

          {status === "downloading" && (
            <>
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Preparing your PDF…</p>
            </>
          )}

          {status === "done" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              <div>
                <h1 className="font-heading text-xl font-bold">Your download has started</h1>
                <p className="text-sm text-muted-foreground mt-1">If it did not start automatically, use the button below.</p>
              </div>
              <Button onClick={() => void handleDownload()} className="w-full rounded-xl gap-2">
                <Download className="w-4 h-4" />
                Download again
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                <XCircle className="w-7 h-7 text-destructive" />
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold">Something went wrong</h1>
                <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
              </div>
              <div className="space-y-3">
                <Button onClick={() => void handleDownload()} className="w-full rounded-xl gap-2" disabled={!token || !pdfPath || !session}>
                  <Download className="w-4 h-4" />
                  Try again
                </Button>
                <Button onClick={() => navigate("/")} variant="outline" className="w-full rounded-xl">
                  Back to home
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
