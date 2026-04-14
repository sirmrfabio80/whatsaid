import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Tag, ChevronDown } from "lucide-react";
import type { TagOption } from "@/hooks/use-history-filters";

interface HistoryFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  tagSuggestions: (TagOption & { displayName?: string })[];
  selectedTags: (TagOption & { displayName?: string })[];
  onToggleTag: (tagId: string) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
  hasAnyTags: boolean;
}

export default function HistoryFilters({
  searchQuery,
  onSearchChange,
  tagSuggestions,
  selectedTags,
  onToggleTag,
  onClearAll,
  hasActiveFilters,
  hasAnyTags,
}: HistoryFiltersProps) {
  const { t } = useTranslation();
  const [tagOpen, setTagOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTagOpen(false);
      }
    };
    if (tagOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tagOpen]);

  const filteredSuggestions = tagSuggestions.filter((tag) =>
    tag.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  return (
    <div className="space-y-3 mb-6">
      {/* Search + Tag filter row */}
      <div className="flex gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("history.searchPlaceholder")}
            className="pl-9 pr-8 h-11 rounded-xl bg-background border-border/60 text-sm"
            aria-label={t("history.searchPlaceholder")}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
              aria-label={t("history.clearSearch")}
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Tag filter button */}
        {hasAnyTags && (
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="outline"
              onClick={() => { setTagOpen(!tagOpen); setTagSearch(""); }}
              className={`h-11 rounded-xl gap-1.5 px-3 min-w-[44px] border-border/60 ${selectedTags.length > 0 ? "border-primary/40 bg-primary/5" : ""}`}
              aria-label={t("history.filterByTag")}
              aria-expanded={tagOpen}
            >
              <Tag className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">{t("history.tags")}</span>
              {selectedTags.length > 0 && (
                <span className="ml-0.5 text-[11px] bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center font-medium">
                  {selectedTags.length}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tagOpen ? "rotate-180" : ""}`} />
            </Button>

            {/* Dropdown */}
            {tagOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="p-2">
                  <Input
                    ref={inputRef}
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder={t("history.searchTags")}
                    className="h-9 rounded-lg text-sm"
                    autoFocus
                    aria-label={t("history.searchTags")}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto px-1 pb-1.5">
                  {filteredSuggestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      {t("history.noMatchingTags")}
                    </p>
                  ) : (
                    filteredSuggestions.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => onToggleTag(tag.id)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left hover:bg-accent/50 transition-colors min-h-[44px]"
                      >
                        {tag.color && (
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                        )}
                        <span className="truncate">{tag.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/60 uppercase">{tag.source}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected tags + clear all */}
      {(selectedTags.length > 0 || hasActiveFilters) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {selectedTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => onToggleTag(tag.id)}
              className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors min-h-[32px]"
              aria-label={`${t("history.removeTag")} ${tag.name}`}
            >
              {tag.color && (
                <span className="w-2 h-2 rounded-full shrink-0 mr-0.5" style={{ backgroundColor: tag.color }} />
              )}
              {tag.name}
              <X className="w-3 h-3 ml-0.5 opacity-60" />
            </button>
          ))}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-xs text-muted-foreground h-8 px-2 rounded-lg hover:text-foreground"
            >
              {t("history.clearAll")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
