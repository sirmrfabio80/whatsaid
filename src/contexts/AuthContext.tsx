import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { useRedeemInvites } from "@/hooks/use-redeem-invites";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  creditBalance: number;
  avatarUrl: string | null;
  refreshCredits: () => Promise<void>;
  refreshAvatar: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  creditBalance: 0,
  avatarUrl: null,
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const refreshCredits = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("credit_balances")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    if (data) setCreditBalance(data.balance);
  };

  const refreshAvatar = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .single();
    setAvatarUrl(data?.avatar_url ?? null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCreditBalance(0);
    setAvatarUrl(null);
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
      refreshAvatar();
    }
  }, [user]);

  // Redeem any pending invites after login
  useRedeemInvites(user?.id, user?.email ?? undefined);

  return (
    <AuthContext.Provider value={{ user, session, loading, creditBalance, avatarUrl, refreshCredits, refreshAvatar, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
