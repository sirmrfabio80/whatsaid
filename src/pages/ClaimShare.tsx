import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Loader2, Check, AlertTriangle, ArrowRight, LogIn, UserPlus } from "lucide-react";
import logoImg from "@/assets/logo.webp";

type ClaimStatus =
  | "loading"
  | "valid"
  | "needs_auth"
  | "claiming"
  | "claimed"
  | "already_claimed"
  | "expired"
  | "not_found"
  | "email_mismatch"
  | "error";

interface ShareInfo {
  title: string;
  recipient_email: string;
  shared_by_name: string | null;
}

export default function ClaimShare() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ClaimStatus>("loading");
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [claimedJobId, setClaimedJobId] = useState<string | null>(null);
  const [expectedEmail, setExpectedEmail] = useState<string | null>(null);
  const claimAttempted = useRef(false);

  // Step 1: Validate the token (no auth required)
  useEffect(() => {
    if (!token) { setStatus("not_found"); return; }

    const validate = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-transcript-share?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const body = await res.json();

        if (!res.ok) {
          if (body.error === "already_claimed") setStatus("already_claimed");
          else if (body.error === "expired") setStatus("expired");
          else if (body.error === "not_found") setStatus("not_found");
          else setStatus("error");
          return;
        }

        setShareInfo({ title: body.title, recipient_email: body.recipient_email, shared_by_name: body.shared_by_name });
        setStatus("valid");
      } catch {
        setStatus("error");
      }
    };

    validate();
  }, [token]);

  // Step 2: After auth loads, auto-claim if user is logged in with correct email
  useEffect(() => {
    if (authLoading || status !== "valid" || !shareInfo || claimAttempted.current) return;

    if (!user) {
      setStatus("needs_auth");
      return;
    }

    // User is authenticated — attempt claim
    claimAttempted.current = true;
    claimShare();
  }, [authLoading, user, status, shareInfo]);

  const claimShare = async () => {
    if (!token) return;
    setStatus("claiming");
    try {
      const { data, error } = await supabase.functions.invoke("claim-transcript-share", {
        body: { token },
      });

      if (error) {
        setStatus("error");
        return;
      }

      if (data?.error === "email_mismatch") {
        setExpectedEmail(data.expected_email || null);
        setStatus("email_mismatch");
        return;
      }
      if (data?.error === "already_claimed" && data?.job_id) {
        setClaimedJobId(data.job_id);
        setStatus("claimed");
        return;
      }
      if (data?.error === "already_claimed") {
        setStatus("already_claimed");
        return;
      }
      if (data?.error === "expired") { setStatus("expired"); return; }
      if (data?.error === "not_found" || data?.error === "job_not_found") { setStatus("not_found"); return; }
      if (data?.error) { setStatus("error"); return; }

      if (data?.success && data?.job_id) {
        setClaimedJobId(data.job_id);
        setStatus("claimed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const handleGoToAuth = (mode: "login" | "signup") => {
    const returnUrl = `/claim/${token}`;
    navigate(`/${mode}?redirect=${encodeURIComponent(returnUrl)}`);
  };

  if (status === "loading") {
    return (
      <ClaimLayout>
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">{t("claim.validating")}</p>
        </div>
      </ClaimLayout>
    );
  }

  if (status === "claiming") {
    return (
      <ClaimLayout>
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">{t("claim.claiming")}</p>
        </div>
      </ClaimLayout>
    );
  }

  if (status === "claimed" && claimedJobId) {
    return (
      <ClaimLayout>
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Check className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground mb-1">{t("claim.successTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("claim.successDesc")}</p>
          </div>
          <Button className="rounded-xl gap-2 mt-2" onClick={() => navigate(`/job/${claimedJobId}`)}>
            <FileText className="w-4 h-4" />
            {t("claim.viewTranscript")}
          </Button>
        </div>
      </ClaimLayout>
    );
  }

  if (status === "needs_auth") {
    return (
      <ClaimLayout>
        <div className="space-y-4 py-2">
          {shareInfo && (
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4 mb-2">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{shareInfo.title}</p>
                  {shareInfo.shared_by_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("claim.sharedBy", { name: shareInfo.shared_by_name })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            {t("claim.signInToAccess")}
          </p>
          <div className="flex flex-col gap-2.5">
            <Button className="w-full h-11 rounded-xl gap-2" onClick={() => handleGoToAuth("login")}>
              <LogIn className="w-4 h-4" />
              {t("common.signIn")}
            </Button>
            <Button variant="outline" className="w-full h-11 rounded-xl gap-2" onClick={() => handleGoToAuth("signup")}>
              <UserPlus className="w-4 h-4" />
              {t("claim.createAccount")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {t("claim.emailHint", { email: shareInfo?.recipient_email || "" })}
          </p>
        </div>
      </ClaimLayout>
    );
  }

  if (status === "email_mismatch") {
    return (
      <ClaimLayout>
        <ErrorState
          icon={<AlertTriangle className="w-6 h-6 text-warning" />}
          title={t("claim.emailMismatchTitle")}
          desc={t("claim.emailMismatchDesc", { email: expectedEmail || "" })}
        >
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/")}>
            {t("common.backToHome")}
          </Button>
        </ErrorState>
      </ClaimLayout>
    );
  }

  if (status === "already_claimed") {
    return (
      <ClaimLayout>
        <ErrorState
          icon={<Check className="w-6 h-6 text-muted-foreground" />}
          title={t("claim.alreadyClaimedTitle")}
          desc={t("claim.alreadyClaimedDesc")}
        >
          <Button className="rounded-xl gap-2" onClick={() => navigate("/history")}>
            <FileText className="w-4 h-4" />
            {t("claim.goToHistory")}
          </Button>
        </ErrorState>
      </ClaimLayout>
    );
  }

  if (status === "expired") {
    return (
      <ClaimLayout>
        <ErrorState
          icon={<AlertTriangle className="w-6 h-6 text-warning" />}
          title={t("claim.expiredTitle")}
          desc={t("claim.expiredDesc")}
        >
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/")}>
            {t("common.backToHome")}
          </Button>
        </ErrorState>
      </ClaimLayout>
    );
  }

  if (status === "not_found") {
    return (
      <ClaimLayout>
        <ErrorState
          icon={<AlertTriangle className="w-6 h-6 text-destructive" />}
          title={t("claim.notFoundTitle")}
          desc={t("claim.notFoundDesc")}
        >
          <Button variant="outline" className="rounded-xl" onClick={() => navigate("/")}>
            {t("common.backToHome")}
          </Button>
        </ErrorState>
      </ClaimLayout>
    );
  }

  // error fallback
  return (
    <ClaimLayout>
      <ErrorState
        icon={<AlertTriangle className="w-6 h-6 text-destructive" />}
        title={t("claim.errorTitle")}
        desc={t("claim.errorDesc")}
      >
        <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
          {t("common.tryAgain")}
        </Button>
      </ErrorState>
    </ClaimLayout>
  );
}

function ClaimLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 animate-page-enter">
      <Card className="w-full max-w-md rounded-xl border-border/50 shadow-sm">
        <CardHeader className="text-center pb-2">
          <img src={logoImg} alt="WhatSaid" className="w-12 h-12 rounded-xl mx-auto mb-3" />
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">{icon}</div>
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
      </div>
      {children}
    </div>
  );
}
