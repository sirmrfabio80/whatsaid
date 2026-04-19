import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, FileText, AlertTriangle } from "lucide-react";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { usePageMeta } from "@/hooks/use-page-meta";

type ClaimStatus = "loading" | "ready" | "claiming" | "claimed" | "error" | "needsAuth";

interface ShareInfo {
  title: string;
  senderEmail: string;
  expired: boolean;
  alreadyClaimed: boolean;
}

export default function ClaimShare() {
  const { token } = useParams<{ token: string }>();
  const { user, session, loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ClaimStatus>("loading");
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const claimedRef = useRef(false);

  // Step 1: Validate the token
  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg(t("claim.invalidLink")); return; }

    const validate = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("claim-transcript-share", {
          method: "GET",
          headers: { "x-share-token": token },
        } as any);

        if (error || data?.error) {
          setErrorMsg(data?.error || t("claim.invalidLink"));
          setStatus("error");
          return;
        }

        setShareInfo(data);

        if (data.alreadyClaimed) {
          setErrorMsg(t("claim.alreadyClaimed"));
          setStatus("error");
          return;
        }
        if (data.expired) {
          setErrorMsg(t("claim.expired"));
          setStatus("error");
          return;
        }

        // Check auth
        if (authLoading) return; // wait
        if (!user) {
          setStatus("needsAuth");
        } else {
          // Let the backend decide access — always attempt claim
          setStatus("ready");
        }
      } catch {
        setErrorMsg(t("claim.genericError"));
        setStatus("error");
      }
    };

    validate();
  }, [token, authLoading, user, t]);

  // Auto-claim when user is authenticated and share is ready
  useEffect(() => {
    if (status === "ready" && user && session && !claimedRef.current) {
      void claimShare();
    }
  }, [status, user, session]);

  const claimShare = async () => {
    if (claimedRef.current || !session || !token) return;
    claimedRef.current = true;
    setStatus("claiming");

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-transcript-share`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const raw = await response.text();
      let data: { error?: string; job_id?: string } = {};

      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = { error: raw };
        }
      }

      if (!response.ok) {
        setErrorMsg(data.error || t("claim.noAccess"));
        setStatus("error");
        return;
      }

      setStatus("claimed");
      setTimeout(() => {
        navigate(`/job/${data.job_id}`);
      }, 2000);
    } catch {
      setErrorMsg(t("claim.claimFailed"));
      setStatus("error");
    }
  };

  const handleSignIn = () => {
    navigate(`/login?redirect=${encodeURIComponent(`/claim/${token}`)}`);
  };

  const handleSignUp = () => {
    navigate(`/signup?redirect=${encodeURIComponent(`/claim/${token}`)}`);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-6">
          {status === "loading" && (
            <>
              <InlineSpinner size="lg" tone="primary" className="mx-auto" />
              <p className="text-body-sm text-muted-foreground">{t("claim.validating")}</p>
            </>
          )}

          {status === "needsAuth" && shareInfo && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h2 className="text-h1">{t("claim.sharedWithYou")}</h2>
                <p className="text-body-sm text-muted-foreground mt-1">
                  {t("claim.sharedByDesc", { sender: shareInfo.senderEmail })}
                </p>
                {shareInfo.title && (
                  <p className="text-body-sm font-medium mt-3 px-3 py-2 bg-muted/50 rounded-lg">
                    "{shareInfo.title}"
                  </p>
                )}
              </div>
              <p className="text-body-sm text-muted-foreground">{t("claim.signInToClaim")}</p>
              <div className="space-y-3">
                <Button onClick={handleSignIn} className="w-full rounded-xl">
                  {t("common.signIn")}
                </Button>
                <Button onClick={handleSignUp} variant="outline" className="w-full rounded-xl">
                  {t("claim.createAccount")}
                </Button>
              </div>
            </>
          )}

          {status === "claiming" && (
            <>
              <InlineSpinner size="lg" tone="primary" className="mx-auto" />
              <p className="text-body-sm text-muted-foreground">{t("claim.claiming")}</p>
            </>
          )}

          {status === "claimed" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <div>
                <h2 className="text-h1">{t("claim.success")}</h2>
                <p className="text-body-sm text-muted-foreground mt-1">{t("claim.successDesc")}</p>
              </div>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
                {errorMsg.includes("claimed") ? (
                  <AlertTriangle className="w-7 h-7 text-amber-500" />
                ) : (
                  <XCircle className="w-7 h-7 text-destructive" />
                )}
              </div>
              <div>
                <h2 className="text-h1">{t("claim.errorTitle")}</h2>
                <p className="text-body-sm text-muted-foreground mt-1">{errorMsg}</p>
              </div>
              <Button onClick={() => navigate("/")} variant="outline" className="rounded-xl">
                {t("common.backToHome")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
