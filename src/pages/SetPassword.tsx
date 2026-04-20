import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function SetPassword() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  usePageMeta({ title: "Set password — WhatSaid", noindex: true, robots: "noindex,nofollow" });
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading || !user) return null;

  const handleSetPassword = async () => {
    setError(null);
    if (password.length < 6) {
      setError(t("setPassword.minLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("setPassword.mismatch"));
      return;
    }
    setSaving(true);
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setError(pwError.message);
      setSaving(false);
      return;
    }
    // Clear the flag
    await supabase
      .from("profiles")
      .update({ needs_password_setup: false } as any)
      .eq("user_id", user.id);
    toast.success(t("setPassword.success"));
    navigate("/", { replace: true });
  };

  const handleSkip = () => {
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center animate-page-enter-flat">
      <div className="w-full max-w-md px-4">
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-h1">{t("setPassword.title")}</h1>
              <p className="text-muted-foreground text-body-sm">{t("setPassword.subtitle")}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="set-pw">{t("setPassword.passwordLabel")}</Label>
                <Input
                  id="set-pw"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder={t("setPassword.passwordPlaceholder")}
                  className="rounded-lg h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-set-pw">{t("setPassword.confirmLabel")}</Label>
                <Input
                  id="confirm-set-pw"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  className="rounded-lg h-11"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-body-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handleSetPassword}
                disabled={saving}
                className="w-full rounded-lg h-11"
              >
                {saving ? t("setPassword.saving") : t("setPassword.setPasswordBtn")}
              </Button>

              <button
                onClick={handleSkip}
                className="w-full text-center text-body-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                {t("setPassword.skipForNow")}
              </button>

              <p className="text-caption text-muted-foreground text-center">
                {t("setPassword.skipHint")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
