import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import i18n from "@/i18n";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  creditBalance: number;
  refreshCredits: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  creditBalance: 0,
  refreshCredits: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditBalance, setCreditBalance] = useState(0);

  const refreshCredits = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("credit_balances")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    if (data) setCreditBalance(data.balance);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setCreditBalance(0);
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
      // Load persisted UI language from profile
      supabase
        .from("profiles")
        .select("ui_language")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.ui_language) {
            i18n.changeLanguage(data.ui_language);
          }
        });
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, session, loading, creditBalance, refreshCredits, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
