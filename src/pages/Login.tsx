import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mic, AlertCircle, Check, ArrowLeft } from "lucide-react";
import { lovable } from "@/integrations/lovable/index";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message || "Google sign-in failed");
      setGoogleLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate("/");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    navigate("/");
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setError(error.message);
      setResetLoading(false);
      return;
    }
    setResetSent(true);
    setResetLoading(false);
  };

  if (forgotMode) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 animate-page-enter">
        <Card className="w-full max-w-md rounded-xl border-border/50 shadow-sm">
          <CardHeader className="text-center">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Mic className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="font-heading text-2xl">{t("login.resetTitle")}</CardTitle>
            <CardDescription>
              {resetSent ? t("login.resetDescSent") : t("login.resetDescDefault")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetSent ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary text-sm">
                  <Check className="w-4 h-4" />
                  <span>{t("login.resetLinkSent")} <strong>{email}</strong></span>
                </div>
                <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => { setForgotMode(false); setResetSent(false); }}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  {t("login.backToSignIn")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">{t("login.email")}</Label>
                  <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className="rounded-xl h-11" />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full h-11 rounded-xl" disabled={resetLoading}>
                  {resetLoading ? t("login.sending") : t("login.sendResetLink")}
                </Button>
                <Button variant="ghost" type="button" className="w-full text-sm" onClick={() => { setForgotMode(false); setError(null); }}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  {t("login.backToSignIn")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 animate-page-enter">
      <Card className="w-full max-w-md rounded-xl border-border/50 shadow-sm">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mic className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-heading text-2xl">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className="rounded-xl h-11" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t("login.password")}</Label>
                <button type="button" onClick={() => { setForgotMode(true); setError(null); }} className="text-xs text-primary hover:underline">
                  {t("login.forgotPassword")}
                </button>
              </div>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" className="rounded-xl h-11" />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" className="w-full h-11 rounded-xl" disabled={loading}>
              {loading ? t("login.signingIn") : t("common.signIn")}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t("common.or")}</span></div>
          </div>

          <Button variant="outline" className="w-full h-11 rounded-xl" onClick={handleGoogleLogin} disabled={googleLoading}>
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {googleLoading ? t("login.signingIn") : t("login.continueWithGoogle")}
          </Button>

          <p className="text-center text-sm text-muted-foreground mt-4">
            {t("login.privateBeta")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
