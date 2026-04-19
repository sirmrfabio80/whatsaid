import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import logoImg from "@/assets/logo.webp";
import { Checkbox } from "@/components/ui/checkbox";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function Signup() {
  const { t } = useTranslation();

  usePageMeta({
    title: "Sign up — WhatSaid",
    description:
      "Create a WhatSaid account to transcribe audio with speaker labels, summaries, and AI Q&A. No subscription — pay-as-you-go credits.",
    canonical: "https://whatsaid.app/signup",
    ogImage: "https://whatsaid.app/og-signup.png",
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const purchaseIntent = searchParams.get("intent") === "purchase";
  const productParam = searchParams.get("product");
  const redirectParam = searchParams.get("redirect");

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: displayName },
        emailRedirectTo: redirectParam
          ? `${window.location.origin}${redirectParam}`
          : window.location.origin,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md rounded-xl border-border/50">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
            <h2 className="text-h1">{t("signup.accountCreated")}</h2>
            <p className="text-body-sm text-muted-foreground">{t("signup.checkEmail")}</p>
            <Button className="rounded-xl" onClick={() => navigate(redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login")}>{t("signup.goToSignIn")}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md rounded-xl border-border/50">
        <CardHeader className="text-center">
            <img src={logoImg} alt="WhatSaid" className="w-12 h-12 rounded-xl mx-auto mb-4" />
          <CardTitle className="text-h1">
            {purchaseIntent ? t("signup.purchaseTitle") : t("signup.title")}
          </CardTitle>
          <CardDescription>
            {purchaseIntent ? t("signup.purchaseSubtitle") : t("signup.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("signup.displayName")}</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required placeholder={t("signup.displayNamePlaceholder")} className="rounded-xl h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("signup.email")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" className="rounded-xl h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("signup.password")}</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder={t("signup.passwordPlaceholder")} className="rounded-xl h-11" />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={acceptedTerms}
                onCheckedChange={(c) => setAcceptedTerms(c === true)}
                className="mt-0.5"
              />
              <label htmlFor="terms" className="text-body-sm text-muted-foreground leading-snug cursor-pointer">
                {t("signup.termsAgree")}{" "}
                <Link to="/terms" className="text-primary hover:underline font-medium" target="_blank">{t("signup.termsOfService")}</Link>
                {" "}{t("signup.and")}{" "}
                <Link to="/privacy" className="text-primary hover:underline font-medium" target="_blank">{t("footer.privacy")}</Link>
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-body-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full h-11 rounded-xl" disabled={loading || !acceptedTerms}>
              {loading ? t("signup.creating") : t("signup.createAccount")}
            </Button>
          </form>

          <p className="text-center text-body-sm text-muted-foreground mt-6">
            {t("signup.alreadyHaveAccount")}{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">{t("common.signIn")}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
