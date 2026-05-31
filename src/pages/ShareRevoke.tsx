import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePageMeta } from "@/hooks/use-page-meta";

const MAX_REASON_LENGTH = 500;

type Stage = "confirm" | "working" | "revoked" | "already" | "notFound" | "invalid" | "error";

export default function ShareRevoke() {
  const [params] = useSearchParams();
  const token = (params.get("token") ?? "").trim();
  const [stage, setStage] = useState<Stage>("confirm");

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
      const { data, error } = await supabase.functions.invoke("share-revoke", {
        body: { token },
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
                Revoking will immediately stop this transcript from being viewable. The link will return an "expired" page to anyone who tries to open it. This cannot be undone.
              </p>
              <Button onClick={revoke} className="w-full">Revoke access now</Button>
              <p className="text-xs text-muted-foreground">
                You don't need an account to do this — knowing this link is enough.
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

          <div className="pt-2 border-t">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Back to WhatSaid</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
