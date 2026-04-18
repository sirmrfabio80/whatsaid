import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, FileText, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

export interface ExtraSource {
  id: string;
  title: string;
}

interface Props {
  currentJobId: string;
  value: ExtraSource[];
  onChange: (next: ExtraSource[]) => void;
  max?: number;
}

interface SearchRow {
  id: string;
  title: string | null;
  file_name: string;
}

/**
 * Tags-style picker for choosing additional transcript jobs to feed into a
 * Question call. RLS scopes the underlying jobs query to the caller, and
 * `status='completed'` filtering is enforced both client- and server-side.
 *
 * Kept isolated from JobResults so the Questions tab stays minimal.
 */
export default function QuestionExtraSourcesPicker({
  currentJobId,
  value,
  onChange,
  max = 5,
}: Props) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebouncedValue(inputValue.trim(), 300);
  const limitReached = value.length >= max;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Search whenever debounced query changes (and dropdown is open)
  useEffect(() => {
    let cancelled = false;
    if (!showResults) return;

    (async () => {
      setSearching(true);
      let query = supabase
        .from("jobs")
        .select("id, title, file_name")
        .eq("status", "completed")
        .neq("id", currentJobId)
        .order("created_at", { ascending: false })
        .limit(8);

      if (debouncedQuery.length > 0) {
        // Escape % and _ to avoid wildcard injection
        const safe = debouncedQuery.replace(/[%_]/g, (m) => `\\${m}`);
        query = query.or(`title.ilike.%${safe}%,file_name.ilike.%${safe}%`);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (!error && data) {
        const selectedIds = new Set(value.map((v) => v.id));
        setResults((data as SearchRow[]).filter((r) => !selectedIds.has(r.id)));
      } else {
        setResults([]);
      }
      setSearching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, showResults, currentJobId, value]);

  const displayTitle = (row: SearchRow): string => row.title?.trim() || row.file_name;

  const handleAdd = (row: SearchRow) => {
    if (limitReached) return;
    if (value.some((v) => v.id === row.id)) return;
    onChange([...value, { id: row.id, title: displayTitle(row) }]);
    setInputValue("");
    setResults((prev) => prev.filter((r) => r.id !== row.id));
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((v) => v.id !== id));
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((src) => (
          <Badge
            key={src.id}
            variant="secondary"
            className="rounded-full gap-1 text-xs font-medium pl-2.5 pr-1 py-0.5 group/src"
          >
            <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="truncate max-w-[180px]">{src.title}</span>
            <button
              type="button"
              onClick={() => handleRemove(src.id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/15 transition-colors"
              aria-label={t("jobResults.extraSources.removeAriaLabel", { title: src.title })}
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </Badge>
        ))}

        <div className="relative">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowResults(false);
                setInputValue("");
              }
              if (e.key === "Enter" && results.length > 0) {
                e.preventDefault();
                handleAdd(results[0]);
              }
            }}
            placeholder={
              limitReached
                ? t("jobResults.extraSources.limitReached", { max })
                : t("jobResults.extraSources.searchPlaceholder")
            }
            disabled={limitReached}
            className="h-8 w-48 sm:w-56 text-xs px-2.5 rounded-full border-dashed"
            maxLength={120}
            aria-label={t("jobResults.extraSources.searchPlaceholder")}
          />

          {showResults && !limitReached && (
            <div
              className={cn(
                "absolute top-full left-0 mt-1 z-50 w-72 rounded-xl border border-border bg-popover shadow-lg py-1 max-h-60 overflow-y-auto",
                "animate-in fade-in-0 zoom-in-95 duration-150",
              )}
            >
              {searching ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {t("jobResults.extraSources.noResults")}
                </div>
              ) : (
                results.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => handleAdd(row)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-3 h-3 text-primary shrink-0" />
                    <span className="truncate">{displayTitle(row)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
