import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, Clock, FileText, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import AvatarUpload from "@/components/AvatarUpload";

export default function Profile() {
  const { user, loading, creditBalance, avatarUrl, refreshAvatar } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
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
      const lastJob = data?.[0]?.created_at ? data[0].created_at : null;
      return { totalJobs, totalMinutes, lastJob };
    },
    enabled: !!user,
  });

  const isStatsLoading = !jobStats && !!user;
  if (loading || !user) return null;

  const initials = (profile?.display_name || user.email || "U")
    .split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "";

  const stats = [
    { label: t("profile.totalJobs"), value: jobStats?.totalJobs ?? 0, icon: FileText },
    { label: t("profile.minutesProcessed"), value: jobStats?.totalMinutes ?? 0, icon: Clock },
    { label: t("profile.lastConversion"), value: jobStats?.lastJob ?? "—", icon: Clock },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-10 sm:py-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <AvatarUpload
              userId={user.id}
              avatarUrl={avatarUrl}
              initials={initials}
              size="lg"
              onUploaded={() => refreshAvatar()}
            />
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold">{profile?.display_name || t("profile.user")}</h1>
              <p className="text-sm text-muted-foreground">{profile?.email || user.email}</p>
              {memberSince && <p className="text-xs text-muted-foreground mt-0.5">{t("profile.memberSince", { date: memberSince })}</p>}
            </div>
          </div>

          <Card className="rounded-xl border-border bg-card shadow-sm">
            <CardContent className="p-5 sm:p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-muted border border-border px-3 py-1.5 rounded-lg">
                  <span className="font-heading font-bold text-lg">{creditBalance}</span>
                  <span className="text-sm text-muted-foreground ml-1.5">{t("common.credits")}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => navigate("/credits")}>
                <CreditCard className="w-4 h-4 mr-1.5" />
                {t("profile.buyMore")}
              </Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {stats.map(({ label, value, icon: Icon }) => (
              <Card key={label} className="rounded-xl border-border bg-card shadow-sm hover:border-primary/20 hover:shadow-md transition-all overflow-hidden">
                <CardContent className="p-3 sm:p-4 text-center">
                  <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-2" />
                  {isStatsLoading ? (
                    <Skeleton className="h-6 w-12 mx-auto mb-1 rounded-lg" />
                  ) : (
                    <p className="font-heading font-semibold text-base sm:text-lg truncate">{value}</p>
                  )}
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button className="flex-1 rounded-lg h-11" onClick={() => navigate("/convert")}>
              {t("profile.convertAudio")}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" className="flex-1 rounded-lg h-11" onClick={() => navigate("/history")}>
              {t("profile.viewHistory")}
            </Button>
            <Button variant="outline" className="flex-1 rounded-lg h-11" onClick={() => navigate("/settings")}>
              {t("nav.settings")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
