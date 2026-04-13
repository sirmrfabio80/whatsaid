import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X, AlertTriangle, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface Segment {
  id: string;
  index: number;
  speaker: string | null;
  text: string;
  raw: string;
}

export interface SpeakerSuggestion {
  id: string;
  confidence: number;
  speaker: string;
}

interface TranscriptEditorProps {
  content: string;
  speakerNames: Record<string, string>;
  allSpeakers?: string[];
  onSave: (newContent: string) => Promise<void>;
  transcriptEdited: boolean;
  suggestions?: SpeakerSuggestion[];
  suggestingTarget?: string | null;
  onAcceptSuggestions?: (accepted: SpeakerSuggestion[]) => void;
  onDismissSuggestions?: () => void;
  onEditedIdsChange?: (ids: Set<string>) => void;
}

export function parseSegments(content: string): Segment[] {
  return content.split("\n").map((line, index) => {
    const snippet = line.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "");
    const id = `seg-${index}-${line.length}-${snippet}`;
    const match = line.match(/^(.+?):\s(.*)/);
    if (match) {
      return { id, index, speaker: match[1], text: match[2], raw: line };
    }
    return { id, index, speaker: null, text: line, raw: line };
  });
}

function reconstructContent(segments: Segment[]): string {
  return segments.map((s) => {
    if (s.speaker) return `${s.speaker}: ${s.text}`;
    return s.raw;
  }).join("\n");
}

function getUniqueSpeakers(segments: Segment[]): string[] {
  const speakers = new Set<string>();
  segments.forEach((s) => { if (s.speaker) speakers.add(s.speaker); });
  return [...speakers];
}

function applySpeakerNamesToText(text: string, speakerNames: Record<string, string>): string {
  let result = text;
  for (const [original, renamed] of Object.entries(speakerNames)) {
    if (renamed) result = result.split(original).join(renamed);
  }
  return result;
}

// Color palette for speaker badges — cycles for >8 speakers
const SPEAKER_COLORS = [
  { border: "hsl(245, 50%, 48%)", bg: "hsl(245, 50%, 48%, 0.08)", dot: "hsl(245, 50%, 48%)" },
  { border: "hsl(170, 55%, 42%)", bg: "hsl(170, 55%, 42%, 0.08)", dot: "hsl(170, 55%, 42%)" },
  { border: "hsl(38, 90%, 50%)",  bg: "hsl(38, 90%, 50%, 0.08)",  dot: "hsl(38, 90%, 50%)" },
  { border: "hsl(340, 60%, 50%)", bg: "hsl(340, 60%, 50%, 0.08)", dot: "hsl(340, 60%, 50%)" },
  { border: "hsl(200, 65%, 50%)", bg: "hsl(200, 65%, 50%, 0.08)", dot: "hsl(200, 65%, 50%)" },
  { border: "hsl(280, 50%, 55%)", bg: "hsl(280, 50%, 55%, 0.08)", dot: "hsl(280, 50%, 55%)" },
  { border: "hsl(145, 55%, 38%)", bg: "hsl(145, 55%, 38%, 0.08)", dot: "hsl(145, 55%, 38%)" },
  { border: "hsl(15, 70%, 50%)",  bg: "hsl(15, 70%, 50%, 0.08)",  dot: "hsl(15, 70%, 50%)" },
];

function getSpeakerColor(speaker: string, allSpeakers: string[]) {
  const idx = allSpeakers.indexOf(speaker);
  return SPEAKER_COLORS[(idx >= 0 ? idx : 0) % SPEAKER_COLORS.length];
}

export default function TranscriptEditor({
  content, speakerNames, allSpeakers: allSpeakersProp, onSave, transcriptEdited,
  suggestions, suggestingTarget, onAcceptSuggestions, onDismissSuggestions, onEditedIdsChange,
}: TranscriptEditorProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [segments, setSegments] = useState<Segment[]>(() => parseSegments(content));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  const [rejectedSuggestionIds, setRejectedSuggestionIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) {
      setSegments(parseSegments(content));
    }
  }, [content, editing]);

  useEffect(() => {
    setRejectedSuggestionIds(new Set());
  }, [suggestions]);

  const contentSpeakers = getUniqueSpeakers(segments);
  const speakers = allSpeakersProp
    ? [...new Set([...contentSpeakers, ...allSpeakersProp])]
    : contentSpeakers;

  const activeSuggestions = new Map<string, SpeakerSuggestion>();
  if (suggestions) {
    for (const s of suggestions) {
      if (!rejectedSuggestionIds.has(s.id) && !editedIds.has(s.id)) {
        activeSuggestions.set(s.id, s);
      }
    }
  }

  const hasSuggestions = activeSuggestions.size > 0;

  const startEdit = useCallback((index: number) => {
    const seg = segments[index];
    setActiveIndex(index);
    setEditText(seg.text);
    setDirty(false);
  }, [segments]);

  const handleSegmentClick = useCallback((index: number) => {
    if (!editing) return;
    if (activeIndex === index) return;
    if (activeIndex !== null && dirty) {
      setConfirmSwitch(index);
      return;
    }
    startEdit(index);
  }, [editing, activeIndex, dirty, startEdit]);

  const cancelEdit = useCallback(() => {
    setActiveIndex(null);
    setEditText("");
    setDirty(false);
  }, []);

  const saveSegment = useCallback(async () => {
    if (activeIndex === null) return;
    setSaving(true);
    const segId = segments[activeIndex].id;
    const updated = segments.map((s, i) => {
      if (i !== activeIndex) return s;
      return {
        ...s,
        text: editText,
        raw: s.speaker ? `${s.speaker}: ${editText}` : editText,
      };
    });
    setSegments(updated);
    const newEditedIds = new Set(editedIds);
    newEditedIds.add(segId);
    setEditedIds(newEditedIds);
    onEditedIdsChange?.(newEditedIds);
    try {
      await onSave(reconstructContent(updated));
      setActiveIndex(null);
      setDirty(false);
    } catch {
      setSegments(parseSegments(content));
    } finally {
      setSaving(false);
    }
  }, [activeIndex, editText, segments, onSave, content, editedIds, onEditedIdsChange]);

  // Speaker-only reassignment — auto-saves immediately
  const reassignSpeaker = useCallback(async (segIndex: number, newSpeaker: string) => {
    const seg = segments[segIndex];
    if (!seg.speaker || seg.speaker === newSpeaker) return;
    setSaving(true);
    const updated = segments.map((s, i) => {
      if (i !== segIndex) return s;
      return {
        ...s,
        speaker: newSpeaker,
        raw: `${newSpeaker}: ${s.text}`,
      };
    });
    setSegments(updated);
    const newEditedIds = new Set(editedIds);
    newEditedIds.add(seg.id);
    setEditedIds(newEditedIds);
    onEditedIdsChange?.(newEditedIds);
    try {
      await onSave(reconstructContent(updated));
    } catch {
      setSegments(parseSegments(content));
    } finally {
      setSaving(false);
    }
  }, [segments, onSave, content, editedIds, onEditedIdsChange]);

  const toggleEditing = useCallback(() => {
    if (editing && activeIndex !== null && dirty) {
      setConfirmSwitch(-1);
      return;
    }
    if (editing) {
      cancelEdit();
    }
    setEditing(!editing);
  }, [editing, activeIndex, dirty, cancelEdit]);

  const handleConfirmDiscard = useCallback(() => {
    cancelEdit();
    if (confirmSwitch === -1) {
      setEditing(false);
    } else if (confirmSwitch !== null) {
      startEdit(confirmSwitch);
    }
    setConfirmSwitch(null);
  }, [confirmSwitch, cancelEdit, startEdit]);

  const handleRejectSuggestion = useCallback((segId: string) => {
    setRejectedSuggestionIds((prev) => {
      const next = new Set(prev);
      next.add(segId);
      return next;
    });
  }, []);

  const handleAcceptAll = useCallback(() => {
    if (!onAcceptSuggestions) return;
    const accepted = [...activeSuggestions.values()];
    onAcceptSuggestions(accepted);
  }, [activeSuggestions, onAcceptSuggestions]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [editText, activeIndex]);

  const displaySpeaker = (speaker: string) => speakerNames[speaker] || speaker;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          {transcriptEdited && !editing && (
            <span className="inline-flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3" />
              {t("jobResults.transcriptUpdated")}
            </span>
          )}
        </div>
        <Button
          variant={editing ? "default" : "outline"}
          size="sm"
          className="rounded-lg gap-1.5 text-xs h-8"
          onClick={toggleEditing}
        >
          <Pencil className="w-3.5 h-3.5" />
          {editing ? t("jobResults.doneEditing") : t("jobResults.editTranscript")}
        </Button>
      </div>

      {/* Suggestion bar */}
      {hasSuggestions && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-border/50 bg-primary/5">
          <span className="text-xs font-medium text-primary shrink-0">
            {t("speakerSuggestions.previewLabel", { count: activeSuggestions.size, speaker: speakerNames[suggestingTarget ?? ""] || (suggestingTarget ?? "") })}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              className="rounded-lg gap-1.5 h-8 text-xs"
              onClick={handleAcceptAll}
            >
              <Check className="w-3.5 h-3.5" />
              {t("speakerSuggestions.acceptAll", { count: activeSuggestions.size })}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-lg gap-1.5 h-8 text-xs text-muted-foreground"
              onClick={onDismissSuggestions}
            >
              <X className="w-3.5 h-3.5" />
              {t("speakerSuggestions.dismiss")}
            </Button>
          </div>
        </div>
      )}

      {/* Transcript lines */}
      <div className="p-5 sm:p-6">
        <div className="space-y-1">
          {segments.map((seg, i) => {
            const isActive = activeIndex === i;
            const isEmpty = !seg.text.trim() && !seg.speaker;
            const suggestion = activeSuggestions.get(seg.id);

            if (isEmpty) return <div key={seg.id} className="h-2" />;

            // Active text editing
            if (isActive && editing) {
              const color = seg.speaker ? getSpeakerColor(seg.speaker, speakers) : null;
              return (
                <div
                  key={seg.id}
                  className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3"
                  style={color ? { borderLeftWidth: 3, borderLeftColor: color.border } : undefined}
                >
                  {seg.speaker && (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: color?.bg, color: color?.border }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color?.dot }} />
                        {displaySpeaker(seg.speaker)}
                      </span>
                    </div>
                  )}
                  <Textarea
                    ref={textareaRef}
                    value={editText}
                    onChange={(e) => { setEditText(e.target.value); setDirty(true); }}
                    className="rounded-xl text-sm min-h-[44px] resize-none"
                    disabled={saving}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="rounded-lg gap-1.5 h-9 min-w-[44px] px-4 text-xs"
                      onClick={saveSegment}
                      disabled={saving || !dirty}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t("jobResults.saveSegment")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg gap-1.5 h-9 min-w-[44px] px-4 text-xs"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      <X className="w-3.5 h-3.5" />
                      {t("jobResults.cancelEdit")}
                    </Button>
                  </div>
                </div>
              );
            }

            // Read-only line with speaker badge
            const displayedText = applySpeakerNamesToText(seg.text, speakerNames);
            const hasSuggestionHighlight = !!suggestion;
            const color = seg.speaker ? getSpeakerColor(seg.speaker, speakers) : null;

            return (
              <div
                key={seg.id}
                className={`flex items-start gap-0 rounded-lg transition-colors ${
                  hasSuggestionHighlight
                    ? suggestion.confidence >= 0.8
                      ? "bg-primary/5"
                      : "bg-primary/[0.03]"
                    : ""
                } ${
                  editing && !hasSuggestionHighlight
                    ? "hover:bg-muted/60 group"
                    : ""
                }`}
                style={color ? { borderLeft: `3px solid ${hasSuggestionHighlight ? color.border : color.border + "60"}`, paddingLeft: 0 } : undefined}
              >
                {/* Speaker badge */}
                {seg.speaker && (
                  <SpeakerBadge
                    speaker={seg.speaker}
                    displayName={displaySpeaker(seg.speaker)}
                    color={color!}
                    editing={editing}
                    speakers={speakers}
                    speakerNames={speakerNames}
                    displaySpeaker={displaySpeaker}
                    onReassign={(newSpeaker) => reassignSpeaker(i, newSpeaker)}
                    disabled={saving}
                  />
                )}

                {/* Text content */}
                <div
                  className={`flex-1 min-w-0 py-2 pr-3 ${!seg.speaker ? "pl-3" : ""} ${
                    editing ? "cursor-pointer" : ""
                  }`}
                  role={editing ? "button" : undefined}
                  tabIndex={editing ? 0 : undefined}
                  onClick={() => {
                    if (editing) handleSegmentClick(i);
                  }}
                  onKeyDown={(e) => {
                    if (editing && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      handleSegmentClick(i);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm leading-relaxed flex-1">
                      {displayedText}
                      {editing && !hasSuggestionHighlight && (
                        <Pencil className="w-3 h-3 text-muted-foreground/40 inline-block ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </p>
                    {hasSuggestionHighlight && (
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        <span className="inline-flex items-center text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-md whitespace-nowrap">
                          → {displaySpeaker(suggestion.speaker)}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRejectSuggestion(seg.id); }}
                          className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                          aria-label={t("speakerSuggestions.rejectOne")}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Report issue */}
      <div className="px-5 pb-4 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg gap-1.5 text-xs h-8 text-muted-foreground"
          onClick={() => toast.info(t("jobResults.reportIssuePlaceholder"))}
        >
          <MessageSquareWarning className="w-3.5 h-3.5" />
          {t("jobResults.reportIssue")}
        </Button>
      </div>

      {/* Unsaved changes dialog */}
      <AlertDialog open={confirmSwitch !== null} onOpenChange={(open) => { if (!open) setConfirmSwitch(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              {t("jobResults.unsavedChanges")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("jobResults.unsavedChangesDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              {t("jobResults.discardChanges")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Speaker Badge with Popover ─── */

function SpeakerBadge({
  speaker, displayName, color, editing, speakers, speakerNames, displaySpeaker,
  onReassign, disabled,
}: {
  speaker: string;
  displayName: string;
  color: { border: string; bg: string; dot: string };
  editing: boolean;
  speakers: string[];
  speakerNames: Record<string, string>;
  displaySpeaker: (s: string) => string;
  onReassign: (newSpeaker: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold pl-2.5 pr-2 py-2 shrink-0 select-none whitespace-nowrap ${
        editing ? "cursor-pointer hover:opacity-80" : ""
      }`}
      style={{ color: color.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color.dot }} />
      {displayName}
    </span>
  );

  if (!editing) return badge;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-l-lg"
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          aria-label={t("jobResults.changeSpeaker")}
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-44 p-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
          {t("jobResults.changeSpeaker")}
        </div>
        {speakers.filter((s) => s !== null).map((sp) => {
          const spColor = getSpeakerColor(sp, speakers);
          const isCurrent = sp === speaker;
          return (
            <button
              key={sp}
              onClick={() => {
                if (!isCurrent) onReassign(sp);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors ${
                isCurrent
                  ? "bg-muted font-semibold"
                  : "hover:bg-muted/60"
              }`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: spColor.dot }} />
              <span className="flex-1 text-left truncate">{displaySpeaker(sp)}</span>
              {isCurrent && <Check className="w-3 h-3 text-primary shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
