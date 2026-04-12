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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Lock, Trash2, Check, AlertCircle, Mail, Globe } from "lucide-react";
import AdminInviteCard from "@/components/AdminInviteCard";

const UI_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
  { code: "fr", label: "Français" },
] as const;

export default function Settings() {
  const { user, loading, signOut, needsPasswordSetup } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [uiLanguage, setUiLanguage] = useState(i18n.language?.slice(0, 2) || "en");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSaving, setSetupSaving] = useState(false);

  useEffect(() => { if (!loading && !user) navigate("/login"); }, [user, loading, navigate]);

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
      if (profile.ui_language) setUiLanguage(profile.ui_language);
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["profile"] }); setProfileSaved(true); setProfileError(null); setTimeout(() => setProfileSaved(false), 3000); },
    onError: () => { setProfileError(t("settings.couldNotUpdate")); setProfileSaved(false); },
  });

  const handleLanguageChange = async (val: string) => {
    setUiLanguage(val);
    i18n.changeLanguage(val);
    if (user) {
      await supabase.from("profiles").update({ ui_language: val }).eq("user_id", user.id);
    }
  };

  const changeEmail = async () => {
    setEmailError(null); setEmailSaved(false); setEmailLoading(true);
    if (!newEmail || !newEmail.includes("@")) { setEmailError(t("settings.invalidEmail")); setEmailLoading(false); return; }
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) { setEmailError(error.message); setEmailLoading(false); }
    else {
      if (user) { await supabase.from("profiles").update({ email: newEmail }).eq("user_id", user.id); queryClient.invalidateQueries({ queryKey: ["profile"] }); }
      setEmailSaved(true); setEmailLoading(false); setNewEmail("");
      setTimeout(() => { setEmailOpen(false); setEmailSaved(false); }, 2000);
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
    // Force a page reload to clear the needsPasswordSetup state
    window.location.reload();
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-10 sm:py-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold">{t("settings.title")}</h1>

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="font-heading font-semibold text-lg">{t("settings.account")}</h2>
              <div className="space-y-2">
                <Label htmlFor="display-name">{t("settings.displayName")}</Label>
                <Input id="display-name" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setProfileSaved(false); setProfileError(null); }} className="rounded-lg h-11" />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.emailLabel")}</Label>
                <Input value={profile?.email || user.email || ""} disabled className="rounded-lg h-11 opacity-60" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button className="rounded-lg" size="sm" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
                  <Save className="w-4 h-4 mr-1.5" />{t("settings.saveChanges")}
                </Button>
                <Dialog open={emailOpen} onOpenChange={(open) => { setEmailOpen(open); if (!open) { setEmailError(null); setEmailSaved(false); } }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="rounded-lg" size="sm"><Mail className="w-4 h-4 mr-1.5" />{t("settings.changeEmail")}</Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-xl">
                    <DialogHeader>
                      <DialogTitle>{t("settings.changeEmailTitle")}</DialogTitle>
                      <DialogDescription>{t("settings.changeEmailDesc")}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="new-email">{t("settings.newEmail")}</Label>
                        <Input id="new-email" type="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailError(null); }} placeholder="you@example.com" className="rounded-lg h-11" />
                      </div>
                      {emailError && <div className="flex items-center gap-2 text-destructive text-sm"><AlertCircle className="w-4 h-4" /><span>{emailError}</span></div>}
                      {emailSaved && <div className="flex items-center gap-2 text-primary text-sm"><Check className="w-4 h-4" /><span>{t("settings.emailUpdated")}</span></div>}
                    </div>
                    <DialogFooter>
                      <Button onClick={changeEmail} className="rounded-lg" disabled={emailLoading}>{emailLoading ? t("settings.updatingEmail") : t("settings.updateEmail")}</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                {profileSaved && <span className="text-xs text-primary flex items-center gap-1"><Check className="w-3.5 h-3.5" />{t("common.saved")}</span>}
                {profileError && <span className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{profileError}</span>}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="font-heading font-semibold text-lg">{t("settings.preferences")}</h2>
              <div className="space-y-2">
                <Label htmlFor="ui-language">{t("settings.interfaceLanguage")}</Label>
                <p className="text-xs text-muted-foreground">{t("settings.interfaceLanguageDesc")}</p>
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

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="font-heading font-semibold text-lg">{t("settings.security")}</h2>
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
                    {passwordError && <div className="flex items-center gap-2 text-destructive text-sm"><AlertCircle className="w-4 h-4" /><span>{passwordError}</span></div>}
                    {passwordSaved && <div className="flex items-center gap-2 text-primary text-sm"><Check className="w-4 h-4" /><span>{t("settings.passwordUpdated")}</span></div>}
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
              <h2 className="font-heading font-semibold text-lg text-destructive">{t("settings.dangerZone")}</h2>
              <p className="text-sm text-muted-foreground">{t("settings.dangerDesc")}</p>
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
                    <AlertDialogAction className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("settings.deleteMyAccount")}</AlertDialogAction>
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
