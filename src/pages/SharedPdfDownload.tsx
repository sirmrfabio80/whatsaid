import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileText, CheckCircle2 } from "lucide-react";
import { ErrorState } from "@/components/ui/error-state";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { usePageMeta } from "@/hooks/use-page-meta";
type DownloadStatus = "loading" | "needsAuth" | "ready" | "downloading" | "done" | "error";

export default function SharedPdfDownload() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  usePageMeta({ title: "Shared PDF — WhatSaid", noindex: true, robots: "noindex,nofollow" });
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
      setErrorMsg(t("sharedPdf.errorInvalidLink"));
      return;
    }
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
        let message = t("sharedPdf.errorGeneric");
        try {
          const raw = await response.text();
          if (raw) {
            try {
              const data = JSON.parse(raw);
              message = data?.error || message;
            } catch {
              message = raw;
            }
          }
        } catch {
          // ignore response read errors
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
      setErrorMsg(error instanceof Error ? error.message : t("sharedPdf.errorGeneric"));
      setStatus("error");
    }
  };

  const redirectTarget = `${location.pathname}${location.search}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-6">
          {status === "loading" && (
            <>
              <InlineSpinner size="lg" tone="primary" className="mx-auto" />
              <p className="text-body-sm text-muted-foreground">{t("sharedPdf.checking")}</p>
            </>
          )}

          {status === "needsAuth" && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-h1">{t("sharedPdf.signInTitle")}</h1>
                <p className="text-body-sm text-muted-foreground mt-1">
                  {t("sharedPdf.signInDesc")}
                </p>
              </div>
              <div className="space-y-3">
                <Button onClick={() => navigate(`/login?redirect=${encodeURIComponent(redirectTarget)}`)} className="w-full rounded-xl">
                  {t("sharedPdf.signInBtn")}
                </Button>
                <Button onClick={() => navigate(`/signup?redirect=${encodeURIComponent(redirectTarget)}`)} variant="outline" className="w-full rounded-xl">
                  {t("sharedPdf.createAccountBtn")}
                </Button>
              </div>
            </>
          )}

          {status === "downloading" && (
            <>
              <InlineSpinner size="lg" tone="primary" className="mx-auto" />
              <p className="text-body-sm text-muted-foreground">{t("sharedPdf.preparing")}</p>
            </>
          )}

          {status === "done" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              <div>
                <h1 className="text-h1">{t("sharedPdf.doneTitle")}</h1>
                <p className="text-body-sm text-muted-foreground mt-1">{t("sharedPdf.doneDesc")}</p>
              </div>
              <Button onClick={() => void handleDownload()} className="w-full rounded-xl gap-2">
                <Download className="w-4 h-4" />
                {t("sharedPdf.downloadAgain")}
              </Button>
            </>
          )}

          {status === "error" && (
            <ErrorState
              variant="plain"
              title={t("sharedPdf.errorTitle")}
              description={errorMsg}
              action={
                <div className="space-y-3 w-full">
                  <Button onClick={() => void handleDownload()} className="w-full rounded-xl gap-2" disabled={!token || !pdfPath || !session}>
                    <Download className="w-4 h-4" />
                    {t("sharedPdf.tryAgain")}
                  </Button>
                  <Button onClick={() => navigate("/")} variant="outline" className="w-full rounded-xl">
                    {t("sharedPdf.backToHome")}
                  </Button>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
