import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export interface Segment {
  id: string;
  index: number;
  speaker: string | null;
  text: string;
  raw: string;
}

export interface SpeakerSuggestion {
  id: string; // segment ID
  confidence: number; // 0.0–1.0
  speaker: string; // target speaker name
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
    // Deterministic ID: stable across calls for the same content
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

export default function TranscriptEditor({
  content, speakerNames, allSpeakers: allSpeakersProp, onSave, transcriptEdited,
  suggestions, suggestingTarget, onAcceptSuggestions, onDismissSuggestions, onEditedIdsChange,
}: TranscriptEditorProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [segments, setSegments] = useState<Segment[]>(() => parseSegments(content));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editSpeaker, setEditSpeaker] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  const [rejectedSuggestionIds, setRejectedSuggestionIds] = useState<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync segments when content changes externally
  useEffect(() => {
    if (!editing) {
      setSegments(parseSegments(content));
    }
  }, [content, editing]);

  // Clear rejected suggestions when suggestions change
  useEffect(() => {
    setRejectedSuggestionIds(new Set());
  }, [suggestions]);

  const contentSpeakers = getUniqueSpeakers(segments);
  const speakers = allSpeakersProp
    ? [...new Set([...contentSpeakers, ...allSpeakersProp])]
    : contentSpeakers;

  // Build active suggestions map (excluding rejected + edited)
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
    setEditSpeaker(seg.speaker ?? "");
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
    setEditSpeaker("");
    setDirty(false);
  }, []);

  const saveSegment = useCallback(async () => {
    if (activeIndex === null) return;
    setSaving(true);
    const segId = segments[activeIndex].id;
    const updated = segments.map((s, i) => {
      if (i !== activeIndex) return s;
      const newSpeaker = editSpeaker || s.speaker;
      return {
        ...s,
        speaker: newSpeaker,
        text: editText,
        raw: newSpeaker ? `${newSpeaker}: ${editText}` : editText,
      };
    });
    setSegments(updated);
    // Track this segment as manually edited
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
  }, [activeIndex, editSpeaker, editText, segments, onSave, content, editedIds, onEditedIdsChange]);

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

  // Auto-resize textarea
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
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
          {segments.map((seg, i) => {
            const isActive = activeIndex === i;
            const isEmpty = !seg.text.trim() && !seg.speaker;
            const suggestion = activeSuggestions.get(seg.id);

            if (isEmpty) return <div key={seg.id} className="h-2" />;

            if (isActive && editing) {
              return (
                <div key={seg.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 mb-3 space-y-3">
                  {seg.speaker && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-muted-foreground shrink-0">
                        {t("jobResults.changeSpeaker")}
                      </label>
                      <Select value={editSpeaker} onValueChange={(v) => { setEditSpeaker(v); setDirty(true); }}>
                        <SelectTrigger className="h-8 w-[160px] text-xs rounded-lg border-border/60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {speakers.map((sp) => (
                            <SelectItem key={sp} value={sp} className="text-xs">
                              {displaySpeaker(sp)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

            // Read-only line
            const displayedText = applySpeakerNamesToText(seg.text, speakerNames);
            const hasSuggestionHighlight = !!suggestion;

            return (
              <div
                key={seg.id}
                role={editing ? "button" : undefined}
                tabIndex={editing ? 0 : undefined}
                className={`mb-3 ${
                  hasSuggestionHighlight
                    ? `rounded-lg px-3 py-2 -mx-2 transition-colors ${
                        suggestion.confidence >= 0.8
                          ? "border-l-[3px] border-l-primary/60 bg-primary/5"
                          : "border-l-[3px] border-l-primary/30 border-dashed bg-primary/[0.03]"
                      }`
                    : ""
                } ${
                  editing && !hasSuggestionHighlight
                    ? "cursor-pointer rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group"
                    : ""
                }`}
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
                  <p className="inline flex-1">
                    {seg.speaker && (
                      <strong className="font-semibold">{displaySpeaker(seg.speaker)}:{" "}</strong>
                    )}
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
            );
          })}
        </div>
      </div>

      {/* Report issue placeholder */}
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
