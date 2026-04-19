import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Lock, Trash2, AlertCircle, Globe, Volume2, Headphones } from "lucide-react";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { setSpeechPreferences, speechManager, useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { toast } from "sonner";
import AdminInviteCard from "@/components/AdminInviteCard";

const ALLOWED_VOICES = ["male", "female"] as const;
type AllowedVoice = (typeof ALLOWED_VOICES)[number];
const ALLOWED_SPEEDS = [0.75, 1.0, 1.25, 1.5] as const;
type AllowedSpeed = (typeof ALLOWED_SPEEDS)[number];

const UI_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "fr", label: "Français" },
] as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Settings() {
  const { user, loading, signOut, needsPasswordSetup } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [uiLanguage, setUiLanguage] = useState(i18n.language?.slice(0, 2) || "en");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSaving, setSetupSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [preferredVoice, setPreferredVoice] = useState<AllowedVoice>("female");
  const [playbackSpeed, setPlaybackSpeed] = useState<AllowedSpeed>(1.0);
  const { isSupported: speechSupported } = useSpeechSynthesis();

  useEffect(() => { if (!loading && !user) navigate("/login"); }, [user, loading, navigate]);

  const hasEmailAuth = user?.identities?.some(i => i.provider === 'email') ?? false;

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return !!data;
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setContactEmail(profile.email || user?.email || "");
      if (profile.ui_language) setUiLanguage(profile.ui_language);
      const pv = (profile as { preferred_voice?: string }).preferred_voice;
      if (pv === "male" || pv === "female") setPreferredVoice(pv);
      const ps = (profile as { playback_speed?: number }).playback_speed;
      if (typeof ps === "number" && (ALLOWED_SPEEDS as readonly number[]).includes(ps)) {
        setPlaybackSpeed(ps as AllowedSpeed);
      }
    }
  }, [profile, user?.email]);

  const saveChanges = async () => {
    if (!user) return;
    setEmailError(null);

    // Validate email
    if (!contactEmail || !EMAIL_REGEX.test(contactEmail.trim())) {
      setEmailError(t("settings.invalidEmail"));
      return;
    }

    // Validate listening preferences before save (guards UI + DB CHECK)
    if (!(ALLOWED_VOICES as readonly string[]).includes(preferredVoice)) {
      toast.error(t("settings.listening.invalidValue"));
      return;
    }
    if (!(ALLOWED_SPEEDS as readonly number[]).includes(playbackSpeed)) {
      toast.error(t("settings.listening.invalidValue"));
      return;
    }

    setSaving(true);
    const trimmedEmail = contactEmail.trim();

    // Check email uniqueness before saving
    const emailChanged = trimmedEmail.toLowerCase() !== (profile?.email || "").toLowerCase();
    if (emailChanged) {
      try {
        const { data: validation, error: valError } = await supabase.functions.invoke("validate-profile-email", {
          body: { email: trimmedEmail },
        });
        if (valError || !validation || validation.available === false) {
          setEmailError(t("settings.emailUnavailable"));
          setSaving(false);
          return;
        }
      } catch {
        setEmailError(t("settings.emailUnavailable"));
        setSaving(false);
        return;
      }
    }

    // Update profiles (includes listening preferences)
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        email: trimmedEmail,
        preferred_voice: preferredVoice,
        playback_speed: playbackSpeed,
      })
      .eq("user_id", user.id);

    if (profileError) {
      toast.error(t("settings.couldNotUpdate"));
      setSaving(false);
      return;
    }

    // Push prefs into the live speech manager so /job/:id picks them up immediately.
    setSpeechPreferences({ voice: preferredVoice, rate: playbackSpeed });

    // Conditionally trigger auth email change for email-password users
    const authEmailChanged = hasEmailAuth && trimmedEmail.toLowerCase() !== (user.email || "").toLowerCase();

    if (authEmailChanged) {
      const { error: authError } = await supabase.auth.updateUser({ email: trimmedEmail });
      if (authError) {
        toast.warning(t("settings.authEmailChangeFailed"));
      } else {
        toast.info(t("settings.emailConfirmRequired"));
      }
    } else {
      toast.success(t("common.saved"));
    }

    queryClient.invalidateQueries({ queryKey: ["profile"] });
    setSaving(false);
  };

  const handleLanguageChange = async (val: string) => {
    setUiLanguage(val);
    i18n.changeLanguage(val);
    if (user) {
      await supabase.from("profiles").update({ ui_language: val }).eq("user_id", user.id);
    }
  };

  const changePassword = async () => {
    setPasswordError(null); setPasswordSaved(false);
    if (newPassword.length < 6) { setPasswordError(t("settings.minLength")); return; }
    if (newPassword !== confirmPassword) { setPasswordError(t("settings.mismatch")); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordError(error.message); }
    else { setPasswordSaved(true); setNewPassword(""); setConfirmPassword(""); setTimeout(() => { setPasswordOpen(false); setPasswordSaved(false); }, 1500); }
  };

  const handleSetupPassword = async () => {
    setSetupError(null);
    if (setupPassword.length < 6) { setSetupError(t("settings.minLength")); return; }
    if (setupPassword !== setupConfirmPassword) { setSetupError(t("settings.mismatch")); return; }
    setSetupSaving(true);
    const { error } = await supabase.auth.updateUser({ password: setupPassword });
    if (error) { setSetupError(error.message); setSetupSaving(false); return; }
    await supabase.from("profiles").update({ needs_password_setup: false } as any).eq("user_id", user!.id);
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    setSetupSaving(false);
    setSetupPassword(""); setSetupConfirmPassword("");
    window.location.reload();
  };

  const authEmail = user?.email ?? "";

  if (loading || !user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      <div className="container mx-auto px-5 sm:px-6 py-6 sm:py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h1 className="text-h1 sm:text-[1.875rem]">{t("settings.title")}</h1>
            <a href="/help#account" className="text-body-sm text-primary hover:underline whitespace-nowrap">
              {t("settings.helpLink")}
            </a>
          </div>

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="text-h2">{t("settings.account")}</h2>
              <div className="space-y-2">
                <Label htmlFor="display-name">{t("settings.displayName")}</Label>
                <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="rounded-lg h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">{t("settings.emailLabel")}</Label>
                <Input
                  id="contact-email"
                  value={contactEmail}
                  onChange={(e) => { setContactEmail(e.target.value); setEmailError(null); }}
                  className="rounded-lg h-11"
                  placeholder="you@example.com"
                />
                
                {emailError && (
                  <div className="flex items-center gap-2 text-destructive text-body-sm">
                    <AlertCircle className="w-4 h-4" /><span>{emailError}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button className="rounded-lg" size="sm" onClick={saveChanges} disabled={saving}>
                  {saving ? <InlineSpinner size="sm" className="mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
                  {t("settings.saveChanges")}
                </Button>
              </div>
              {authEmail && contactEmail && authEmail.toLowerCase() !== contactEmail.toLowerCase() && (
                <p className="text-caption text-muted-foreground flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  {t("settings.signedInAs", { email: authEmail })}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="text-h2">{t("settings.preferences")}</h2>
              <div className="space-y-2">
                <Label htmlFor="ui-language">{t("settings.interfaceLanguage")}</Label>
                <p className="text-caption text-muted-foreground">{t("settings.interfaceLanguageDesc")}</p>
                <Select value={uiLanguage} onValueChange={handleLanguageChange}>
                  <SelectTrigger id="ui-language" className="rounded-lg h-11 w-full sm:w-[240px]">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {UI_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {needsPasswordSetup && (
            <Card className="rounded-xl border-primary/30 bg-card shadow-sm">
              <CardContent className="p-5 sm:p-6 space-y-4">
                <h2 className="text-h2">{t("settings.setPasswordCard.title")}</h2>
                <p className="text-body-sm text-muted-foreground">{t("settings.setPasswordCard.desc")}</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-pw">{t("settings.newPasswordLabel")}</Label>
                    <Input id="setup-pw" type="password" value={setupPassword} onChange={(e) => { setSetupPassword(e.target.value); setSetupError(null); }} className="rounded-lg h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="setup-confirm-pw">{t("settings.confirmPasswordLabel")}</Label>
                    <Input id="setup-confirm-pw" type="password" value={setupConfirmPassword} onChange={(e) => { setSetupConfirmPassword(e.target.value); setSetupError(null); }} className="rounded-lg h-11" />
                  </div>
                  {setupError && <div className="flex items-center gap-2 text-destructive text-body-sm"><AlertCircle className="w-4 h-4" /><span>{setupError}</span></div>}
                  <Button onClick={handleSetupPassword} disabled={setupSaving} className="rounded-lg" size="sm">
                    <Lock className="w-4 h-4 mr-1.5" />{setupSaving ? t("setPassword.saving") : t("settings.setPasswordCard.setPasswordBtn")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="text-h2">{t("settings.security")}</h2>
              <Dialog open={passwordOpen} onOpenChange={(open) => { setPasswordOpen(open); if (!open) { setPasswordError(null); setPasswordSaved(false); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-lg" size="sm"><Lock className="w-4 h-4 mr-1.5" />{t("settings.changePassword")}</Button>
                </DialogTrigger>
                <DialogContent className="rounded-xl">
                  <DialogHeader>
                    <DialogTitle>{t("settings.changePasswordTitle")}</DialogTitle>
                    <DialogDescription>{t("settings.changePasswordDesc")}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pw">{t("settings.newPasswordLabel")}</Label>
                      <Input id="new-pw" type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }} className="rounded-lg h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pw">{t("settings.confirmPasswordLabel")}</Label>
                      <Input id="confirm-pw" type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }} className="rounded-lg h-11" />
                    </div>
                    {passwordError && <div className="flex items-center gap-2 text-destructive text-body-sm"><AlertCircle className="w-4 h-4" /><span>{passwordError}</span></div>}
                    {passwordSaved && <div className="flex items-center gap-2 text-primary text-body-sm"><span>✓ {t("settings.passwordUpdated")}</span></div>}
                  </div>
                  <DialogFooter>
                    <Button onClick={changePassword} className="rounded-lg">{t("settings.updatePasswordBtn")}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {isAdmin && <AdminInviteCard />}

          <Card className="rounded-xl border-destructive/30 bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="text-h2 text-destructive">{t("settings.dangerZone")}</h2>
              <p className="text-body-sm text-muted-foreground">{t("settings.dangerDesc")}</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="rounded-lg"><Trash2 className="w-4 h-4 mr-1.5" />{t("settings.deleteAccount")}</Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("settings.deleteConfirmDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-lg">{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        const { error } = await supabase.functions.invoke("delete-account");
                        if (error) {
                          toast.error(t("settings.deleteError"));
                          setDeleting(false);
                          return;
                        }
                        toast.success(t("settings.deleteSuccess"));
                        await signOut();
                        navigate("/");
                      }}
                    >
                      {deleting ? <InlineSpinner size="sm" label={t("settings.deletingAccount")} /> : t("settings.deleteMyAccount")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
