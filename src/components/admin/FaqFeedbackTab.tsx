import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ThumbsUp, ThumbsDown, MessageCircleQuestion, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { faq } from "@/content/help/faq";
import { pickLocale } from "@/content/help/pickLocale";

interface FeedbackRow {
  faq_anchor: string;
  helpful: boolean;
  locale: string;
  created_at: string;
}

interface AggregateRow {
  anchor: string;
  helpful: number;
  notHelpful: number;
  total: number;
  ratio: number; // 0..1, helpful share
  byLocale: Record<string, { helpful: number; notHelpful: number }>;
  question: string | null;
  groupTitle: string | null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const NEEDS_ATTENTION_MIN_VOTES = 3;
const NEEDS_ATTENTION_MAX_RATIO = 0.5;

/** Build a lookup from anchor -> { question, groupTitle } using EN copy. */
function buildAnchorIndex() {
  const map = new Map<string, { question: string; groupTitle: string }>();
  for (const group of faq) {
    const groupTitle = pickLocale(group.title, "en");
    for (const item of group.items) {
      const anchor = `faq-${group.id}-${item.id}`;
      map.set(anchor, { question: pickLocale(item.q, "en"), groupTitle });
    }
  }
  return map;
}

export default function FaqFeedbackTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FeedbackRow[]>([]);

  const anchorIndex = useMemo(buildAnchorIndex, []);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const { data, error } = await supabase
      .from("help_faq_feedback")
      .select("faq_anchor, helpful, locale, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      toast.error(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as FeedbackRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const aggregates: AggregateRow[] = useMemo(() => {
    const byAnchor = new Map<string, AggregateRow>();
    for (const r of rows) {
      let agg = byAnchor.get(r.faq_anchor);
      if (!agg) {
        const meta = anchorIndex.get(r.faq_anchor);
        agg = {
          anchor: r.faq_anchor,
          helpful: 0,
          notHelpful: 0,
          total: 0,
          ratio: 0,
          byLocale: {},
          question: meta?.question ?? null,
          groupTitle: meta?.groupTitle ?? null,
        };
        byAnchor.set(r.faq_anchor, agg);
      }
      const lang = r.locale || "?";
      agg.byLocale[lang] ??= { helpful: 0, notHelpful: 0 };
      if (r.helpful) {
        agg.helpful += 1;
        agg.byLocale[lang].helpful += 1;
      } else {
        agg.notHelpful += 1;
        agg.byLocale[lang].notHelpful += 1;
      }
      agg.total += 1;
    }
    for (const a of byAnchor.values()) {
      a.ratio = a.total > 0 ? a.helpful / a.total : 0;
    }
    return [...byAnchor.values()].sort((a, b) => {
      // Sort: lowest helpful ratio first (worst), then by total desc
      if (a.ratio !== b.ratio) return a.ratio - b.ratio;
      return b.total - a.total;
    });
  }, [rows, anchorIndex]);

  const totals = useMemo(() => {
    let helpful = 0;
    let notHelpful = 0;
    for (const r of rows) {
      if (r.helpful) helpful += 1;
      else notHelpful += 1;
    }
    const needsAttention = aggregates.filter(
      (a) => a.total >= NEEDS_ATTENTION_MIN_VOTES && a.ratio <= NEEDS_ATTENTION_MAX_RATIO,
    ).length;
    return {
      total: helpful + notHelpful,
      helpful,
      notHelpful,
      needsAttention,
      uniqueAnchors: aggregates.length,
    };
  }, [rows, aggregates]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>FAQ feedback</CardTitle>
            <CardDescription>
              Aggregated 👍 / 👎 votes on Help page FAQ answers over the last 30 days. Use the
              "needs attention" rows to find answers worth rewriting.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard
              icon={<MessageCircleQuestion className="h-4 w-4" />}
              label="Total votes"
              value={totals.total}
              hint={`${totals.uniqueAnchors} unique answers`}
            />
            <StatCard
              icon={<ThumbsUp className="h-4 w-4" />}
              label="Helpful"
              value={totals.helpful}
              tone="ok"
            />
            <StatCard
              icon={<ThumbsDown className="h-4 w-4" />}
              label="Not helpful"
              value={totals.notHelpful}
              tone={totals.notHelpful > 0 ? "warn" : "default"}
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Needs attention"
              value={totals.needsAttention}
              hint={`≥${NEEDS_ATTENTION_MIN_VOTES} votes, ≤${Math.round(NEEDS_ATTENTION_MAX_RATIO * 100)}% helpful`}
              tone={totals.needsAttention > 0 ? "warn" : "ok"}
            />
            <StatCard
              icon={<RefreshCw className="h-4 w-4" />}
              label="Window"
              value="30d"
              hint="rolling"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-h3">Per-answer breakdown</CardTitle>
          <CardDescription>
            Sorted by helpful ratio ascending — the worst-performing answers appear first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState rows={4} titleWidth="" />
          ) : aggregates.length === 0 ? (
            <EmptyState
              title="No feedback yet"
              description="No FAQ feedback was submitted in the last 30 days."
            />
          ) : (
            <ul className="divide-y divide-border">
              {aggregates.map((a) => {
                const needsAttention =
                  a.total >= NEEDS_ATTENTION_MIN_VOTES && a.ratio <= NEEDS_ATTENTION_MAX_RATIO;
                const ratioPct = Math.round(a.ratio * 100);
                const localeChips = Object.entries(a.byLocale).sort(([la], [lb]) => la.localeCompare(lb));
                return (
                  <li key={a.anchor} className="py-3 flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`/help#${a.anchor}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-sm hover:underline truncate"
                          title={a.question ?? a.anchor}
                        >
                          {a.question ?? a.anchor}
                        </a>
                        {needsAttention && (
                          <Badge variant="destructive" className="text-[10px]">
                            Needs attention
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                        {a.groupTitle && <span>{a.groupTitle}</span>}
                        <span className="font-mono">{a.anchor}</span>
                        {localeChips.length > 0 && (
                          <span>
                            {localeChips
                              .map(
                                ([lang, c]) =>
                                  `${lang}: ${c.helpful}👍/${c.notHelpful}👎`,
                              )
                              .join(" · ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <Badge variant="secondary" className="text-xs gap-1">
                        <ThumbsUp className="h-3 w-3" /> {a.helpful}
                      </Badge>
                      <Badge variant="secondary" className="text-xs gap-1">
                        <ThumbsDown className="h-3 w-3" /> {a.notHelpful}
                      </Badge>
                      <Badge
                        variant={needsAttention ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {ratioPct}% helpful
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "ok" | "warn";
}) {
  const toneClass =
    tone === "warn"
      ? "text-destructive"
      : tone === "ok"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
