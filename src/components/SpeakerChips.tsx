import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pencil, Check, X, Plus, Sparkles, Loader2, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ROLE_SUGGESTIONS = ["Doctor", "Nurse", "Me", "Mum", "Dad", "Receptionist", "Specialist", "Therapist"];

interface SpeakerChipsProps {
  speakers: string[];
  speakerNames: Record<string, string>;
  speakerSegmentCounts?: Record<string, number>;
  deletableSpeakers?: Set<string>;
  onRename: (original: string, newName: string) => void;
  onReset?: () => void;
  onAddSpeaker?: () => void;
  onDeleteSpeaker?: (speaker: string) => void;
  onSuggestSpeaker?: (speaker: string) => void;
  suggestingForSpeaker?: string | null;
}

export default function SpeakerChips({
  speakers, speakerNames, speakerSegmentCounts, deletableSpeakers, onRename, onReset, onAddSpeaker,
  onDeleteSpeaker, onSuggestSpeaker, suggestingForSpeaker,
}: SpeakerChipsProps) {
  const { t } = useTranslation();
  if (speakers.length === 0 && !onAddSpeaker) return null;
  const hasRenames = Object.values(speakerNames).some((v) => !!v);

  return (
    <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Speaker labels">
      <span className="text-xs text-muted-foreground font-medium mr-1">{t("speakerChips.speakers")}</span>
      {speakers.map((speaker) => {
        const segCount = speakerSegmentCounts?.[speaker] ?? -1;
        const isZeroSegments = segCount === 0;
        const isSuggesting = suggestingForSpeaker === speaker;
        const isDeletable = deletableSpeakers?.has(speaker) ?? false;
        return (
          <SpeakerChip
            key={speaker}
            original={speaker}
            displayName={speakerNames[speaker] || speaker}
            isRenamed={!!speakerNames[speaker]}
            onRename={(newName) => onRename(speaker, newName)}
            showSuggest={isZeroSegments && !!onSuggestSpeaker}
            onSuggest={() => onSuggestSpeaker?.(speaker)}
            isSuggesting={isSuggesting}
            isDeletable={isDeletable}
            onDelete={() => onDeleteSpeaker?.(speaker)}
          />
        );
      })}
      {onAddSpeaker && (
        <button
          onClick={onAddSpeaker}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 bg-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[36px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t("speakerChips.addSpeaker")}
        >
          <Plus className="w-3 h-3" />
          <span>{t("speakerChips.addSpeaker")}</span>
        </button>
      )}
      {hasRenames && onReset && (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-lg" onClick={onReset} aria-label={t("speakerChips.resetNames")}>
          {t("speakerChips.resetNames")}
        </Button>
      )}
    </div>
  );
}

function SpeakerChip({
  original, displayName, isRenamed, onRename, showSuggest, onSuggest, isSuggesting,
  isDeletable, onDelete,
}: {
  original: string; displayName: string; isRenamed: boolean; onRename: (name: string) => void;
  showSuggest?: boolean; onSuggest?: () => void; isSuggesting?: boolean;
  isDeletable?: boolean; onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) { setValue(isRenamed ? displayName : ""); setTimeout(() => inputRef.current?.focus(), 0); } }, [editing]);

  const save = () => { const trimmed = value.trim(); if (trimmed && trimmed !== original) onRename(trimmed); setEditing(false); };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-background px-2 py-1 shadow-sm ring-1 ring-primary/10">
        <Input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }} className="h-6 w-24 sm:w-28 text-xs border-none shadow-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent" aria-label={`New name for ${original}`} maxLength={30} />
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={save} aria-label={t("common.save")}><Check className="w-3 h-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={cancel} aria-label={t("common.cancel")}><X className="w-3 h-3" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-muted-foreground shrink-0">{t("speakerChips.suggestions")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[120px]">
            {ROLE_SUGGESTIONS.map((role) => (
              <DropdownMenuItem key={role} onClick={() => { onRename(role); setEditing(false); }} className="text-xs">{role}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs font-medium min-h-[36px] animate-in fade-in-0 zoom-in-95 duration-150">
        <span className="text-destructive-foreground">{t("speakerSuggestions.deleteSpeakerConfirm", { speaker: displayName })}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { setConfirmDelete(false); onDelete?.(); }} aria-label={t("common.delete")}><Check className="w-3 h-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setConfirmDelete(false)} aria-label={t("common.cancel")}><X className="w-3 h-3" /></Button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-0">
      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors min-h-[36px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label={`Rename ${displayName}`}>
        <span>{displayName}</span>
        <Pencil className="w-3 h-3 text-muted-foreground" />
      </button>
      {showSuggest && (
        <button
          onClick={onSuggest}
          disabled={isSuggesting}
          className="inline-flex items-center justify-center w-7 h-7 ml-0.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("speakerSuggestions.suggest")}
          title={t("speakerSuggestions.suggest")}
        >
          {isSuggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        </button>
      )}
      {isDeletable && (
        <button
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center justify-center w-7 h-7 ml-0.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("speakerSuggestions.deleteSpeaker")}
          title={t("speakerSuggestions.deleteSpeaker")}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}