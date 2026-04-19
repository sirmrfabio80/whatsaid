import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { useRedeemInvites } from "@/hooks/use-redeem-invites";
import { setSpeechPreferences } from "@/hooks/use-speech-synthesis";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  creditBalance: number;
  isAdmin: boolean;
  avatarUrl: string | null;
  displayName: string | null;
  needsPasswordSetup: boolean;
  refreshCredits: () => Promise<void>;
  refreshAvatar: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  creditBalance: 0,
  isAdmin: false,
  avatarUrl: null,
  displayName: null,
  needsPasswordSetup: false,
  refreshCredits: async () => {},
  refreshAvatar: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditBalance, setCreditBalance] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const refreshCredits = useCallback(async () => {
    const currentUser = user;
    if (!currentUser) return;
    const { data } = await supabase
      .from("credit_balances")
      .select("balance")
      .eq("user_id", currentUser.id)
      .single();
    if (data) setCreditBalance(data.balance);
  }, [user]);

  const refreshAvatar = useCallback(async () => {
    const currentUser = user;
    if (!currentUser) return;
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", currentUser.id)
      .single();
    setAvatarUrl(data?.avatar_url ?? null);
  }, [user]);

  const refreshProfile = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url, needs_password_setup, display_name, preferred_voice, playback_speed")
      .eq("user_id", uid)
      .single();
    setAvatarUrl(data?.avatar_url ?? null);
    setDisplayName(data?.display_name ?? null);
    setNeedsPasswordSetup(data?.needs_password_setup ?? false);
    // Single source of truth: seed speech playback preferences for the session.
    const voice = (data as { preferred_voice?: string } | null)?.preferred_voice;
    const rate = (data as { playback_speed?: number } | null)?.playback_speed;
    setSpeechPreferences({
      voice: voice === "male" || voice === "female" ? voice : "female",
      rate: typeof rate === "number" ? rate : 1.0,
    });
  }, []);

  const refreshAdminStatus = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!data);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCreditBalance(0);
    setIsAdmin(false);
    setAvatarUrl(null);
    setDisplayName(null);
    setNeedsPasswordSetup(false);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshCredits();
      refreshProfile(user.id);
      refreshAdminStatus(user.id);
    }
  }, [user, refreshCredits, refreshProfile, refreshAdminStatus]);

  // Redirect to /set-password if the flag is set
  useEffect(() => {
    if (!loading && user && needsPasswordSetup && location.pathname !== "/set-password") {
      navigate("/set-password", { replace: true });
    }
  }, [loading, user, needsPasswordSetup, location.pathname, navigate]);

  // Redeem any pending invites after login
  const handleCreditsRedeemed = useCallback(() => {
    refreshCredits();
    if (user) refreshProfile(user.id);
  }, [refreshCredits, refreshProfile, user]);

  useRedeemInvites(user?.id, user?.email ?? undefined, handleCreditsRedeemed);

  return (
    <AuthContext.Provider value={{ user, session, loading, creditBalance, isAdmin, avatarUrl, displayName, needsPasswordSetup, refreshCredits, refreshAvatar, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
