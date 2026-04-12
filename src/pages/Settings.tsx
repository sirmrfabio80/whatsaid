import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LanguageSelector from "@/components/LanguageSelector";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Lock, Trash2, Check, AlertCircle, Mail } from "lucide-react";

export default function Settings() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("auto");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // Inline feedback states
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setProfileSaved(true);
      setProfileError(null);
      setTimeout(() => setProfileSaved(false), 3000);
    },
    onError: () => {
      setProfileError("Could not update profile.");
      setProfileSaved(false);
    },
  });

  const changeEmail = async () => {
    setEmailError(null);
    setEmailSaved(false);
    setEmailLoading(true);

    if (!newEmail || !newEmail.includes("@")) {
      setEmailError("Enter a valid email address.");
      setEmailLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      setEmailError(error.message);
      setEmailLoading(false);
    } else {
      // Also update the profiles table
      if (user) {
        await supabase.from("profiles").update({ email: newEmail }).eq("user_id", user.id);
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      }
      setEmailSaved(true);
      setEmailLoading(false);
      setNewEmail("");
      setTimeout(() => {
        setEmailOpen(false);
        setEmailSaved(false);
      }, 2000);
    }
  };

  const changePassword = async () => {
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword.length < 6) {
      setPasswordError("Must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSaved(true);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setPasswordOpen(false);
        setPasswordSaved(false);
      }, 1500);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-10 sm:py-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold">Settings</h1>

          {/* Account */}
          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="font-heading font-semibold text-lg">Account</h2>
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input id="display-name" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setProfileSaved(false); setProfileError(null); }} className="rounded-lg h-11" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email || user.email || ""} disabled className="rounded-lg h-11 opacity-60" />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <Button className="rounded-lg" size="sm" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
                  <Save className="w-4 h-4 mr-1.5" />
                  Save changes
                </Button>
                <Dialog open={emailOpen} onOpenChange={(open) => { setEmailOpen(open); if (!open) { setEmailError(null); setEmailSaved(false); } }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="rounded-lg" size="sm">
                      <Mail className="w-4 h-4 mr-1.5" />
                      Change email
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-xl">
                    <DialogHeader>
                      <DialogTitle>Change email address</DialogTitle>
                      <DialogDescription>Enter your new email address. You may need to verify it before the change takes effect.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="new-email">New email</Label>
                        <Input id="new-email" type="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailError(null); }} placeholder="you@example.com" className="rounded-lg h-11" />
                      </div>
                      {emailError && (
                        <div className="flex items-center gap-2 text-destructive text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>{emailError}</span>
                        </div>
                      )}
                      {emailSaved && (
                        <div className="flex items-center gap-2 text-primary text-sm">
                          <Check className="w-4 h-4" />
                          <span>Email updated</span>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button onClick={changeEmail} className="rounded-lg" disabled={emailLoading}>
                        {emailLoading ? "Updating..." : "Update email"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                {profileSaved && (
                  <span className="text-xs text-primary flex items-center gap-1"><Check className="w-3.5 h-3.5" />Saved</span>
                )}
                {profileError && (
                  <span className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{profileError}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="font-heading font-semibold text-lg">Preferences</h2>
              <div className="space-y-2">
                <Label>Default language</Label>
                <LanguageSelector value={defaultLanguage} onChange={setDefaultLanguage} />
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="font-heading font-semibold text-lg">Security</h2>
              <Dialog open={passwordOpen} onOpenChange={(open) => { setPasswordOpen(open); if (!open) { setPasswordError(null); setPasswordSaved(false); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-lg" size="sm">
                    <Lock className="w-4 h-4 mr-1.5" />
                    Change password
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-xl">
                  <DialogHeader>
                    <DialogTitle>Change password</DialogTitle>
                    <DialogDescription>Enter your new password below.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-pw">New password</Label>
                      <Input id="new-pw" type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }} className="rounded-lg h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pw">Confirm password</Label>
                      <Input id="confirm-pw" type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }} className="rounded-lg h-11" />
                    </div>
                    {passwordError && (
                      <div className="flex items-center gap-2 text-destructive text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span>{passwordError}</span>
                      </div>
                    )}
                    {passwordSaved && (
                      <div className="flex items-center gap-2 text-primary text-sm">
                        <Check className="w-4 h-4" />
                        <span>Password updated</span>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button onClick={changePassword} className="rounded-lg">Update password</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="rounded-xl border-destructive/30 bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 space-y-4">
              <h2 className="font-heading font-semibold text-lg text-destructive">Danger zone</h2>
              <p className="text-sm text-muted-foreground">Permanently delete your account and all associated data. This action cannot be undone.</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="rounded-lg">
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Delete account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete your account, credits, and all conversion history. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                    <AlertDialogAction className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete my account
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