import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Clock, FileText, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function Profile() {
  const { user, loading, creditBalance } = useAuth();
  const navigate = useNavigate();

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

  const { data: jobStats } = useQuery({
    queryKey: ["job-stats", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, count } = await supabase
        .from("jobs")
        .select("id, duration_seconds, created_at", { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      const totalJobs = count ?? 0;
      const totalMinutes = Math.round((data ?? []).reduce((sum, j) => sum + (j.duration_seconds ?? 0), 0) / 60);
      const lastJob = data?.[0]?.created_at ? new Date(data[0].created_at).toLocaleDateString() : "—";

      return { totalJobs, totalMinutes, lastJob };
    },
    enabled: !!user,
  });

  if (loading || !user) return null;

  const initials = (profile?.display_name || user.email || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Profile header */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-heading font-bold text-xl">
              {initials}
            </div>
            <div>
              <h1 className="font-heading text-xl font-semibold">{profile?.display_name || "User"}</h1>
              <p className="text-sm text-muted-foreground">{profile?.email || user.email}</p>
              {memberSince && <p className="text-xs text-muted-foreground mt-0.5">Member since {memberSince}</p>}
            </div>
          </div>

          {/* Credit balance */}
          <Card className="rounded-xl border-border/50 bg-card">
            <CardContent className="p-5 sm:p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="glass-badge px-3 py-1.5 rounded-lg">
                  <span className="font-heading font-bold text-lg">{creditBalance}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">credits</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => navigate("/credits")}>
                <CreditCard className="w-4 h-4 mr-1.5" />
                Buy more
              </Button>
            </CardContent>
          </Card>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Total jobs", value: jobStats?.totalJobs ?? 0, icon: FileText },
              { label: "Minutes processed", value: jobStats?.totalMinutes ?? 0, icon: Clock },
              { label: "Last conversion", value: jobStats?.lastJob ?? "—", icon: Clock },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="rounded-xl border-border/50 bg-card">
                <CardContent className="p-4 text-center">
                  <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-2" />
                  <p className="font-heading font-semibold text-lg">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1 rounded-xl h-11" onClick={() => navigate("/convert")}>
              Convert audio
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => navigate("/history")}>
              View history
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => navigate("/settings")}>
              Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
