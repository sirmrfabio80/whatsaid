import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X, AlertTriangle, MessageSquareWarning, Scissors, ArrowUpToLine, Plus, Trash2, Search, ChevronUp, ChevronDown } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";

export interface Segment {
  id: string;
  index: number;
  speaker: string | null;
  text: string;
  raw: string;
  timestamp: string | null;
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
  onCreateSpeaker?: () => string | null;
  readOnly?: boolean;
}

export function parseSegments(content: string): Segment[] {
  return content.split("\n").map((line, index) => {
    const snippet = line.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "");
    const id = `seg-${index}-${line.length}-${snippet}`;
    // Handle optional [HH:MM:SS] timestamp prefix before speaker label
    const tsMatch = line.match(/^(\[\d{2}:\d{2}:\d{2}\])\s/);
    const timestamp = tsMatch ? tsMatch[1] : null;
    const afterTs = timestamp ? line.slice(timestamp.length + 1) : line;
    const match = afterTs.match(/^(.+?):\s(.*)/);
    if (match) {
      return { id, index, speaker: match[1], text: match[2], raw: line, timestamp };
    }
    return { id, index, speaker: null, text: afterTs, raw: line, timestamp };
  });
}

function formatTimestamp(ts: string): string {
  const clean = ts.replace(/[\[\]]/g, "");
  return clean.startsWith("00:") ? clean.slice(3) : clean;
}

function reconstructContent(segments: Segment[]): string {
  return segments.map((s) => {
    const prefix = s.timestamp ? `${s.timestamp} ` : "";
    if (s.speaker) return `${prefix}${s.speaker}: ${s.text}`;
    return s.text || s.raw;
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

function generateSegId(): string {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Render text with highlighted matches; flags the active match with a stronger style. */
function renderHighlighted(
  text: string,
  query: string,
  segMatchOffsets: number[],
  activeOffset: number | null,
): React.ReactNode {
  if (!query || segMatchOffsets.length === 0) return text;
  const re = new RegExp(escapeRegExp(query), "gi");
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let matchIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const isActive = activeOffset !== null && segMatchOffsets[matchIdx] === activeOffset;
    parts.push(
      <mark
        key={`hl-${m.index}`}
        className={
          isActive
            ? "bg-primary text-primary-foreground rounded px-0.5"
            : "bg-primary/20 text-foreground rounded px-0.5"
        }
      >
        {m[0]}
      </mark>,
    );
    lastIdx = m.index + m[0].length;
    matchIdx++;
    if (m[0].length === 0) re.lastIndex++; // safety
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function usePointerFine() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setFine(mq.matches);
    const handler = (e: MediaQueryListEvent) => setFine(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return fine;
}

export default function TranscriptEditor({
  content, speakerNames, allSpeakers: allSpeakersProp, onSave, transcriptEdited,
  suggestions, suggestingTarget, onAcceptSuggestions, onDismissSuggestions, onEditedIdsChange,
  onCreateSpeaker, readOnly,
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
  const [mergeConfirm, setMergeConfirm] = useState<{ index: number; prevSpeaker: string; currSpeaker: string } | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropSuccessIndex, setDropSuccessIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingFocusRef = useRef<{ index: number; cursorPos: number } | null>(null);
  const isPointerFine = usePointerFine();

  useEffect(() => {
    if (!editing) {
      setSegments(parseSegments(content));
    }
  }, [content, editing]);

  useEffect(() => {
    setRejectedSuggestionIds(new Set());
  }, [suggestions]);

  // Search index: per-segment text-match offsets + flat nav list (text matches + speaker matches)
  const { perSegMatches, segSpeakerMatch, flatMatches } = useMemo(() => {
    const perSeg: Record<number, number[]> = {};
    const speakerHit: Record<number, boolean> = {};
    const flat: Array<{ segIndex: number; offset: number; type: "text" | "speaker" }> = [];
    const q = searchQuery.trim();
    if (!q) return { perSegMatches: perSeg, segSpeakerMatch: speakerHit, flatMatches: flat };
    const re = new RegExp(escapeRegExp(q), "gi");
    const ql = q.toLowerCase();
    segments.forEach((seg, i) => {
      const speakerDisplay = seg.speaker ? (speakerNames[seg.speaker] || seg.speaker) : "";
      if (speakerDisplay && speakerDisplay.toLowerCase().includes(ql)) {
        speakerHit[i] = true;
        flat.push({ segIndex: i, offset: -1, type: "speaker" });
      }
      const text = applySpeakerNamesToText(seg.text, speakerNames);
      const offsets: number[] = [];
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        offsets.push(m.index);
        flat.push({ segIndex: i, offset: m.index, type: "text" });
        if (m[0].length === 0) re.lastIndex++;
      }
      if (offsets.length) perSeg[i] = offsets;
    });
    return { perSegMatches: perSeg, segSpeakerMatch: speakerHit, flatMatches: flat };
  }, [searchQuery, segments, speakerNames]);

  const totalMatches = flatMatches.length;
  const safeActiveMatch = totalMatches === 0 ? 0 : Math.min(activeMatchIndex, totalMatches - 1);
  const activeMatch = totalMatches > 0 ? flatMatches[safeActiveMatch] : null;

  useEffect(() => { setActiveMatchIndex(0); }, [searchQuery]);

  useEffect(() => {
    if (!activeMatch) return;
    const el = segmentRefs.current.get(activeMatch.segIndex);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMatch?.segIndex, activeMatch?.offset]);

  const goPrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setActiveMatchIndex((i) => (i - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  const goNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setActiveMatchIndex((i) => (i + 1) % totalMatches);
  }, [totalMatches]);

  // Cmd/Ctrl+F focuses the search input (only while this editor is mounted, i.e. Transcript tab)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
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
      const prefix = s.timestamp ? `${s.timestamp} ` : "";
      return {
        ...s,
        text: editText,
        raw: s.speaker ? `${prefix}${s.speaker}: ${editText}` : editText,
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
    if (seg.speaker === newSpeaker) return;
    setSaving(true);
    const updated = segments.map((s, i) => {
      if (i !== segIndex) return s;
      const prefix = s.timestamp ? `${s.timestamp} ` : "";
      return {
        ...s,
        speaker: newSpeaker,
        raw: `${prefix}${newSpeaker}: ${s.text}`,
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

  // Split segment at cursor position
  const splitSegment = useCallback(async () => {
    if (activeIndex === null || !textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const seg = segments[activeIndex];
    const textToUse = dirty ? editText : seg.text;
    
    if (cursorPos <= 0 || cursorPos >= textToUse.length) {
      toast.error(t("jobResults.splitInvalidPosition"));
      return;
    }

    const textBefore = textToUse.slice(0, cursorPos).trimEnd();
    const textAfter = textToUse.slice(cursorPos).trimStart();

    if (!textBefore || !textAfter) {
      toast.error(t("jobResults.splitInvalidPosition"));
      return;
    }

    setSaving(true);
    const newId = generateSegId();
    const updated = [...segments];
    const prefix = seg.timestamp ? `${seg.timestamp} ` : "";
    updated[activeIndex] = {
      ...seg,
      text: textBefore,
      raw: seg.speaker ? `${prefix}${seg.speaker}: ${textBefore}` : textBefore,
    };
    updated.splice(activeIndex + 1, 0, {
      id: newId,
      index: activeIndex + 1,
      speaker: seg.speaker,
      text: textAfter,
      raw: seg.speaker ? `${seg.speaker}: ${textAfter}` : textAfter,
      timestamp: null,
    });
    // Re-index
    updated.forEach((s, i) => { s.index = i; });

    setSegments(updated);
    // Clear suggestions (stale IDs)
    if (suggestions?.length) {
      onDismissSuggestions?.();
    }

    try {
      await onSave(reconstructContent(updated));
      // Focus new segment
      pendingFocusRef.current = { index: activeIndex + 1, cursorPos: 0 };
      setActiveIndex(activeIndex + 1);
      setEditText(textAfter);
      setDirty(false);
      toast.success(t("jobResults.splitSuccess"));
    } catch {
      setSegments(parseSegments(content));
    } finally {
      setSaving(false);
    }
  }, [activeIndex, editText, segments, onSave, content, dirty, suggestions, onDismissSuggestions, t]);

  // Merge current segment into previous
  const mergeUp = useCallback(async (index: number, keepSpeaker?: string) => {
    if (index <= 0) return;
    const prev = segments[index - 1];
    const curr = segments[index];

    // If different speakers and no explicit choice yet, show confirmation
    if (prev.speaker && curr.speaker && prev.speaker !== curr.speaker && !keepSpeaker) {
      setMergeConfirm({ index, prevSpeaker: prev.speaker, currSpeaker: curr.speaker });
      return;
    }

    setSaving(true);
    const speaker = keepSpeaker || prev.speaker || curr.speaker;
    const mergedText = `${prev.text} ${curr.text}`.trim();
    const joinPoint = prev.text.length + 1; // +1 for space

    const updated = segments.filter((_, i) => i !== index).map((s, i) => {
      if (i === index - 1) {
        const prefix = s.timestamp ? `${s.timestamp} ` : "";
        return {
          ...s,
          speaker,
          text: mergedText,
          raw: speaker ? `${prefix}${speaker}: ${mergedText}` : mergedText,
        };
      }
      return { ...s, index: i };
    });
    updated.forEach((s, i) => { s.index = i; });

    setSegments(updated);
    setMergeConfirm(null);
    if (suggestions?.length) {
      onDismissSuggestions?.();
    }

    try {
      await onSave(reconstructContent(updated));
      pendingFocusRef.current = { index: index - 1, cursorPos: joinPoint };
      setActiveIndex(index - 1);
      setEditText(mergedText);
      setDirty(false);
      toast.success(t("jobResults.mergeSuccess"));
    } catch {
      setSegments(parseSegments(content));
    } finally {
      setSaving(false);
    }
  }, [segments, onSave, content, suggestions, onDismissSuggestions, t]);

  // Delete a segment
  const deleteSegment = useCallback(async (index: number) => {
    const nonEmpty = segments.filter((s) => s.text.trim() || s.speaker);
    if (nonEmpty.length <= 1) {
      toast.error(t("jobResults.deleteSegmentLastError"));
      return;
    }
    setSaving(true);
    const updated = segments.filter((_, i) => i !== index);
    updated.forEach((s, i) => { s.index = i; });
    setSegments(updated);
    setDeleteConfirmIndex(null);
    if (suggestions?.length) onDismissSuggestions?.();
    try {
      await onSave(reconstructContent(updated));
      setActiveIndex(null);
      setEditText("");
      setDirty(false);
      toast.success(t("jobResults.deleteSegmentSuccess"));
    } catch {
      setSegments(parseSegments(content));
    } finally {
      setSaving(false);
    }
  }, [segments, onSave, content, suggestions, onDismissSuggestions, t]);

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

  // Auto-resize textarea + handle pending focus
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";

      if (pendingFocusRef.current && activeIndex === pendingFocusRef.current.index) {
        const { cursorPos } = pendingFocusRef.current;
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(cursorPos, cursorPos);
          }
          // Scroll new segment into view
          const el = segmentRefs.current.get(activeIndex!);
          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        pendingFocusRef.current = null;
      }
    }
  }, [editText, activeIndex]);

  // Drop handler for drag-and-drop
  const handleDrop = useCallback((e: React.DragEvent, segIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const speaker = e.dataTransfer.getData("text/plain");
    if (!speaker || !editing) return;
    reassignSpeaker(segIndex, speaker);
    setDropSuccessIndex(segIndex);
    setTimeout(() => setDropSuccessIndex(null), 400);
  }, [editing, reassignSpeaker]);

  const displaySpeaker = (speaker: string) => speakerNames[speaker] || speaker;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border/50 flex-wrap">
        <div className="flex items-center gap-2">
          {transcriptEdited && !editing && (
            <span className="inline-flex items-center gap-1 text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
              <Check className="w-3 h-3" />
              {t("jobResults.transcriptUpdated")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {!readOnly && (
            <Button
              variant={editing ? "default" : "outline"}
              size="sm"
              className="rounded-full gap-1.5 text-xs h-8"
              onClick={toggleEditing}
            >
              <Pencil className="w-3.5 h-3.5" />
              {editing ? t("jobResults.doneEditing") : t("jobResults.editTranscript")}
            </Button>
          )}
          {/* Search */}
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) goPrevMatch(); else goNextMatch();
                } else if (e.key === "Escape") {
                  setSearchQuery("");
                }
              }}
              placeholder={t("jobResults.searchTranscriptPlaceholder")}
              aria-label={t("jobResults.searchTranscriptPlaceholder")}
              className="h-8 w-44 sm:w-52 pl-7 pr-7 text-xs rounded-full"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground"
                aria-label={t("jobResults.searchClear")}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {searchQuery.trim() && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] tabular-nums text-muted-foreground min-w-[3.5rem] text-center">
                {totalMatches > 0
                  ? t("jobResults.searchMatchCount", { current: safeActiveMatch + 1, total: totalMatches })
                  : t("jobResults.searchNoMatches")}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={goPrevMatch}
                disabled={totalMatches === 0}
                aria-label={t("jobResults.searchPrev")}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-full"
                onClick={goNextMatch}
                disabled={totalMatches === 0}
                aria-label={t("jobResults.searchNext")}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
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

      {/* Transcript segments */}
      <div className="p-4 sm:p-5">
        <div className="space-y-2">
          {segments.map((seg, i) => {
            const isActive = activeIndex === i;
            const isEmpty = !seg.text.trim() && !seg.speaker;
            const suggestion = activeSuggestions.get(seg.id);

            if (isEmpty) return <div key={seg.id} className="h-1.5" />;

            const hasSuggestionHighlight = !!suggestion;
            const color = seg.speaker ? getSpeakerColor(seg.speaker, speakers) : null;
            const isDragOver = dragOverIndex === i;
            const isDropSuccess = dropSuccessIndex === i;

            // Active text editing — segment card
            if (isActive && editing) {
              return (
                <div
                  key={seg.id}
                  ref={(el) => { if (el) segmentRefs.current.set(i, el); }}
                  className="rounded-xl border border-primary/20 bg-card p-3 sm:p-4 space-y-3"
                  style={color ? { borderLeftWidth: 3, borderLeftColor: color.border } : undefined}
                >
                  {/* Badge row */}
                  <div className="flex items-center gap-2">
                    {seg.speaker ? (
                      <SpeakerBadge
                        speaker={seg.speaker}
                        displayName={displaySpeaker(seg.speaker)}
                        color={color!}
                        editing={editing}
                        speakers={speakers}
                        speakerNames={speakerNames}
                        displaySpeaker={displaySpeaker}
                        onReassign={(newSpeaker) => reassignSpeaker(i, newSpeaker)}
                        onCreateAndAssign={onCreateSpeaker ? () => { const name = onCreateSpeaker(); if (name) reassignSpeaker(i, name); } : undefined}
                        disabled={saving}
                      />
                    ) : (
                      <UnassignedBadge
                        editing={editing}
                        speakers={speakers}
                        speakerNames={speakerNames}
                        displaySpeaker={displaySpeaker}
                        onReassign={(newSpeaker) => reassignSpeaker(i, newSpeaker)}
                        onCreateAndAssign={onCreateSpeaker ? () => { const name = onCreateSpeaker(); if (name) reassignSpeaker(i, name); } : undefined}
                        disabled={saving}
                      />
                    )}
                    {seg.timestamp && (
                      <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums whitespace-nowrap select-none">
                        {formatTimestamp(seg.timestamp)}
                      </span>
                    )}
                  </div>

                  <Textarea
                    ref={textareaRef}
                    value={editText}
                    onChange={(e) => { setEditText(e.target.value); setDirty(true); }}
                    className="rounded-xl text-sm min-h-[44px] resize-none"
                    disabled={saving}
                  />

                  {/* Toolbar: Save, Cancel, Split, Merge */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="rounded-full gap-1.5 h-9 min-w-[44px] px-4 text-xs"
                      onClick={saveSegment}
                      disabled={saving || !dirty}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t("jobResults.saveSegment")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full gap-1.5 h-9 min-w-[44px] px-4 text-xs"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      <X className="w-3.5 h-3.5" />
                      {t("jobResults.cancelEdit")}
                    </Button>

                    <div className="flex-1" />

                    {/* Split at cursor */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5 h-9 min-w-[44px] px-3 text-xs"
                      onClick={splitSegment}
                      disabled={saving}
                      title={t("jobResults.splitHere")}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t("jobResults.splitHere")}</span>
                    </Button>

                    {/* Merge up */}
                    {i > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full gap-1.5 h-9 min-w-[44px] px-3 text-xs"
                        onClick={() => mergeUp(i)}
                        disabled={saving}
                        title={t("jobResults.mergeUp")}
                      >
                        <ArrowUpToLine className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t("jobResults.mergeUp")}</span>
                      </Button>
                    )}

                    {/* Delete segment */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full gap-1.5 h-9 min-w-[44px] px-3 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() => setDeleteConfirmIndex(i)}
                      disabled={saving}
                      title={t("jobResults.deleteSegment")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t("jobResults.deleteSegment")}</span>
                    </Button>
                  </div>

                  {/* Delete confirmation inline */}
                  {deleteConfirmIndex === i && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2 animate-in fade-in-0 zoom-in-95 duration-150">
                      <p className="text-xs font-medium text-foreground">
                        {t("jobResults.deleteSegmentConfirmTitle")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("jobResults.deleteSegmentConfirmDesc")}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-lg h-8 text-xs gap-1.5"
                          onClick={() => deleteSegment(i)}
                          disabled={saving}
                        >
                          <Trash2 className="w-3 h-3" />
                          {t("jobResults.deleteSegment")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg h-8 text-xs"
                          onClick={() => setDeleteConfirmIndex(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Merge confirmation inline */}
                  {mergeConfirm?.index === i && (
                    <div className="rounded-lg border border-border/60 bg-muted/50 p-3 space-y-2 animate-in fade-in-0 zoom-in-95 duration-150">
                      <p className="text-xs font-medium text-foreground">
                        {t("jobResults.mergeConfirmTitle")}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg h-8 text-xs gap-1.5"
                          onClick={() => mergeUp(i, mergeConfirm.prevSpeaker)}
                        >
                          {t("jobResults.mergeKeepSpeaker", { speaker: displaySpeaker(mergeConfirm.prevSpeaker) })}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg h-8 text-xs gap-1.5"
                          onClick={() => mergeUp(i, mergeConfirm.currSpeaker)}
                        >
                          {t("jobResults.mergeKeepSpeaker", { speaker: displaySpeaker(mergeConfirm.currSpeaker) })}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg h-8 text-xs"
                          onClick={() => setMergeConfirm(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Read-only segment card
            const displayedText = applySpeakerNamesToText(seg.text, speakerNames);

            return (
              <div
                key={seg.id}
                ref={(el) => { if (el) segmentRefs.current.set(i, el); }}
                className={`transition-all duration-150 border-l-[3px] ${
                  editing ? "rounded-xl border bg-card/50 " : "rounded-l-xl bg-card/40 p-3 "
                }${
                  hasSuggestionHighlight
                    ? suggestion.confidence >= 0.8
                      ? "bg-primary/5 border-primary/20"
                      : "bg-primary/[0.03] border-border/30"
                    : editing
                      ? "border-border/30 hover:border-border/60 hover:bg-muted/40"
                      : ""
                }${
                  isDragOver ? " ring-2 ring-primary/50 border-primary/40" : ""
                }${
                  isDropSuccess ? " ring-2 ring-green-500/40" : ""
                }`}
                style={{ '--seg-color': color ? (hasSuggestionHighlight ? color.border : color.border + (editing ? "80" : "60")) : 'transparent', borderLeftColor: 'var(--seg-color)' } as React.CSSProperties}
                onDragOver={editing ? (e) => { e.preventDefault(); setDragOverIndex(i); } : undefined}
                onDragLeave={editing ? () => setDragOverIndex(null) : undefined}
                onDrop={editing ? (e) => handleDrop(e, i) : undefined}
              >
                {/* Speaker badge */}
                <div className={editing ? "pl-3 pt-2" : ""}>
                  {seg.speaker ? (
                    <SpeakerBadge
                      speaker={seg.speaker}
                      displayName={displaySpeaker(seg.speaker)}
                      color={color!}
                      editing={editing}
                      speakers={speakers}
                      speakerNames={speakerNames}
                      displaySpeaker={displaySpeaker}
                      onReassign={(newSpeaker) => reassignSpeaker(i, newSpeaker)}
                      onCreateAndAssign={onCreateSpeaker ? () => { const name = onCreateSpeaker(); if (name) reassignSpeaker(i, name); } : undefined}
                      disabled={saving}
                    />
                  ) : editing ? (
                    <UnassignedBadge
                      editing={editing}
                      speakers={speakers}
                      speakerNames={speakerNames}
                      displaySpeaker={displaySpeaker}
                      onReassign={(newSpeaker) => reassignSpeaker(i, newSpeaker)}
                      onCreateAndAssign={onCreateSpeaker ? () => { const name = onCreateSpeaker(); if (name) reassignSpeaker(i, name); } : undefined}
                      disabled={saving}
                    />
                  ) : null}
                  {seg.timestamp && (
                    <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums whitespace-nowrap select-none">
                      {formatTimestamp(seg.timestamp)}
                    </span>
                  )}
                </div>

                {/* Text content */}
                <div
                  className={`min-w-0 ${editing ? "px-3" : ""} ${seg.speaker || editing ? "pt-1 pb-0" : ""} ${
                    editing ? "cursor-pointer pb-3" : ""
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
                    <p className="text-[15px] leading-[1.7] flex-1">
                      {searchQuery.trim()
                        ? renderHighlighted(
                            displayedText,
                            searchQuery.trim(),
                            perSegMatches[i] ?? [],
                            activeMatch && activeMatch.segIndex === i ? activeMatch.offset : null,
                          )
                        : displayedText}
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
  onReassign, onCreateAndAssign, disabled,
}: {
  speaker: string;
  displayName: string;
  color: { border: string; bg: string; dot: string };
  editing: boolean;
  speakers: string[];
  speakerNames: Record<string, string>;
  displaySpeaker: (s: string) => string;
  onReassign: (newSpeaker: string) => void;
  onCreateAndAssign?: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full select-none whitespace-nowrap ${
        editing ? "cursor-pointer hover:opacity-80" : ""
      }`}
      style={{ color: color.border, backgroundColor: color.bg }}
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
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
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
        {onCreateAndAssign && (
          <>
            <Separator className="my-1" />
            <button
              onClick={() => {
                onCreateAndAssign();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors hover:bg-muted/60 text-muted-foreground"
            >
              <Plus className="w-3 h-3" />
              <span>{t("jobResults.newSpeakerInline")}</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Unassigned Badge with Popover ─── */

function UnassignedBadge({
  editing, speakers, speakerNames, displaySpeaker,
  onReassign, onCreateAndAssign, disabled,
}: {
  editing: boolean;
  speakers: string[];
  speakerNames: Record<string, string>;
  displaySpeaker: (s: string) => string;
  onReassign: (newSpeaker: string) => void;
  onCreateAndAssign?: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const badge = (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-1.5 py-0.5 select-none whitespace-nowrap border border-dashed border-muted-foreground/40 rounded-md text-muted-foreground cursor-pointer hover:border-muted-foreground/60 hover:text-foreground transition-colors">
      {t("jobResults.unassigned")}
    </span>
  );

  if (!editing) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
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
          return (
            <button
              key={sp}
              onClick={() => {
                onReassign(sp);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors hover:bg-muted/60"
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: spColor.dot }} />
              <span className="flex-1 text-left truncate">{displaySpeaker(sp)}</span>
            </button>
          );
        })}
        {onCreateAndAssign && (
          <>
            <Separator className="my-1" />
            <button
              onClick={() => {
                onCreateAndAssign();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors hover:bg-muted/60 text-muted-foreground"
            >
              <Plus className="w-3 h-3" />
              <span>{t("jobResults.newSpeakerInline")}</span>
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
