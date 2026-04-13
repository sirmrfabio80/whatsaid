import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, Pencil, Check, Tag as TagIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useJobTags, Tag } from "@/hooks/use-job-tags";
import { cn } from "@/lib/utils";

interface Props {
  jobId: string;
}

export default function JobDetailTags({ jobId }: Props) {
  const { t } = useTranslation();
  const { jobTags, suggestions, loading, addTag, removeTag, renameTag } = useJobTags(jobId);
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (editingId) setTimeout(() => editRef.current?.focus(), 50);
  }, [editingId]);

  const filtered = suggestions.filter((s) =>
    s.name.toLowerCase().includes(inputValue.trim().toLowerCase())
  );

  const handleAdd = async (name: string) => {
    await addTag(name);
    setInputValue("");
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleAdd(inputValue);
    }
    if (e.key === "Escape") {
      setShowSuggestions(false);
      setInputValue("");
    }
  };

  const startRename = (tag: Tag) => {
    setEditingId(tag.id);
    setEditValue(tag.name);
  };

  const saveRename = async () => {
    if (editingId && editValue.trim()) {
      await renameTag(editingId, editValue);
    }
    setEditingId(null);
  };

  const exactMatch = inputValue.trim() && suggestions.some(
    (s) => s.normalized_name === inputValue.trim().toLowerCase().replace(/\s+/g, " ")
  );
  const showCreate = inputValue.trim().length > 0 && !exactMatch && !jobTags.some(
    (t) => t.normalized_name === inputValue.trim().toLowerCase().replace(/\s+/g, " ")
  );

  if (loading) return null;

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-2">
      <TagIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

      {/* Assigned tags */}
      {jobTags.map((tag) =>
        editingId === tag.id ? (
          <div key={tag.id} className="inline-flex items-center gap-1">
            <Input
              ref={editRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              onBlur={saveRename}
              className="h-7 w-28 text-xs px-2 rounded-full border-primary/30"
              maxLength={50}
              aria-label={t("jobDetail.tags.renameLabel")}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-full"
              onClick={saveRename}
              aria-label={t("common.save")}
            >
              <Check className="w-3 h-3 text-primary" />
            </Button>
          </div>
        ) : (
          <Badge
            key={tag.id}
            variant="secondary"
            className={cn(
              "rounded-full gap-1 text-xs font-medium pl-2.5 pr-1 py-0.5 group/tag",
              "transition-all duration-150 hover:bg-secondary/80"
            )}
          >
            <span
              className="cursor-pointer"
              onClick={() => startRename(tag)}
              title={t("jobDetail.tags.clickToRename")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") startRename(tag); }}
            >
              {tag.name}
            </span>
            {tag.source === "ai" && (
              <span className="text-[10px] text-muted-foreground opacity-60 ml-0.5">AI</span>
            )}
            <button
              onClick={() => removeTag(tag.id)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/15 transition-colors opacity-0 group-hover/tag:opacity-100 focus:opacity-100"
              aria-label={t("jobDetail.tags.remove", { name: tag.name })}
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </Badge>
        )
      )}

      {/* Add tag input */}
      <div className="relative">
        <div className="inline-flex items-center gap-1">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={t("jobDetail.tags.addPlaceholder")}
            className="h-7 w-32 sm:w-36 text-xs px-2.5 rounded-full border-dashed"
            maxLength={50}
            aria-label={t("jobDetail.tags.addLabel")}
          />
        </div>

        {/* Dropdown */}
        {showSuggestions && (filtered.length > 0 || showCreate) && (
          <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-xl border border-border bg-popover shadow-lg py-1 max-h-48 overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-150">
            {filtered.slice(0, 8).map((s) => (
              <button
                key={s.id}
                onClick={() => handleAdd(s.name)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors flex items-center gap-2"
              >
                <TagIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="truncate">{s.name}</span>
                {s.source === "ai" && (
                  <span className="text-[10px] text-muted-foreground ml-auto">AI</span>
                )}
              </button>
            ))}
            {showCreate && (
              <button
                onClick={() => handleAdd(inputValue)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors flex items-center gap-2 border-t border-border"
              >
                <Plus className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate">
                  {t("jobDetail.tags.create", { name: inputValue.trim() })}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
