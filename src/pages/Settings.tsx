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
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Lock, Trash2 } from "lucide-react";

export default function Settings() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [defaultLanguage, setDefaultLanguage] = useState("auto");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);

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
      toast({ title: "Profile updated", description: "Your display name has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not update profile.", variant: "destructive" });
    },
  });

  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated" });
      setNewPassword("");
      setConfirmPassword("");
      setPasswordOpen(false);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto space-y-8">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold">Settings</h1>

          {/* Account */}
          <Card className="rounded-xl border-border/50 bg-card shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-heading font-semibold text-base">Account</h2>
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="rounded-xl h-11" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={profile?.email || user.email || ""} disabled className="rounded-xl h-11 opacity-60" />
              </div>
              <Button className="rounded-xl" size="sm" onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
                <Save className="w-4 h-4 mr-1.5" />
                Save changes
              </Button>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card className="rounded-xl border-border/50 bg-card shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-heading font-semibold text-base">Preferences</h2>
              <div className="space-y-2">
                <Label>Default language</Label>
                <LanguageSelector value={defaultLanguage} onChange={setDefaultLanguage} />
              </div>
            </CardContent>
          </Card>

          {/* Security */}
          <Card className="rounded-xl border-border/50 bg-card shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-heading font-semibold text-base">Security</h2>
              <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-xl" size="sm">
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
                      <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="rounded-xl h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm-pw">Confirm password</Label>
                      <Input id="confirm-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="rounded-xl h-11" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={changePassword} className="rounded-xl">Update password</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="rounded-xl border-destructive/30 bg-card shadow-sm">
            <CardContent className="p-6 space-y-4">
              <h2 className="font-heading font-semibold text-base text-destructive">Danger zone</h2>
              <p className="text-sm text-muted-foreground">Permanently delete your account and all associated data. This action cannot be undone.</p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="rounded-xl">
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
                    <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        toast({ title: "Account deletion", description: "Please contact support to complete account deletion." });
                      }}
                    >
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
