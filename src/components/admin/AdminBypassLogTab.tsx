import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck } from "lucide-react";

type BypassRow = {
  id: string;
  user_id: string;
  function_name: string;
  detected_country: string | null;
  user_agent: string | null;
  created_at: string;
};

type ProfileRow = { user_id: string; email: string | null; display_name: string | null };

export default function AdminBypassLogTab() {
  const [rows, setRows] = useState<BypassRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_region_bypass_log")
        .select("id, user_id, function_name, detected_country, user_agent, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as BypassRow[];
      setRows(list);

      const ids = Array.from(new Set(list.map((r) => r.user_id)));
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, email, display_name")
          .in("user_id", ids);
        if (!cancelled && profs) {
          const map: Record<string, ProfileRow> = {};
          profs.forEach((p) => (map[p.user_id] = p as ProfileRow));
          setProfiles(map);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Admin region bypass log
        </CardTitle>
        <CardDescription>
          Records each time an admin used the app from outside the United Kingdom.
          IPs are stored only as a salted hash. Most recent 100 events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <p className="text-body-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">
            No bypass events recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-left border-b border-border/50">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Admin</th>
                  <th className="py-2 pr-4 font-medium">Country</th>
                  <th className="py-2 pr-4 font-medium">Check</th>
                  <th className="py-2 pr-4 font-medium">User agent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = profiles[r.user_id];
                  return (
                    <tr key={r.id} className="border-b border-border/30 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <div>{p?.display_name ?? "—"}</div>
                        <div className="text-caption text-muted-foreground">
                          {p?.email ?? r.user_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant="outline">{r.detected_country ?? "unknown"}</Badge>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{r.function_name}</td>
                      <td className="py-2 pr-4 text-caption text-muted-foreground max-w-xs truncate">
                        {r.user_agent ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
