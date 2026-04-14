import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Pencil, Undo2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SpeakerIdentification } from "@/lib/speaker-identification";

interface SpeakerIdentificationBannerProps {
  suggestions: SpeakerIdentification[];
  onAccept: (speakerLabel: string, name: string) => void;
  onReject: (speakerLabel: string) => void;
  onUndo: (speakerLabel: string) => void;
  onEdit: (speakerLabel: string, newName: string) => void;
  onDismiss: () => void;
}

export default function SpeakerIdentificationBanner({
  suggestions,
  onAccept,
  onReject,
  onUndo,
  onEdit,
  onDismiss,
}: SpeakerIdentificationBannerProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const applied = suggestions.filter((s) => s.status === "applied");
  const suggested = suggestions.filter((s) => s.status === "suggested");
  const hasContent = applied.length > 0 || suggested.length > 0;

  if (!hasContent) return null;

  const startEdit = (speakerLabel: string, currentName: string) => {
    setEditingSpeaker(speakerLabel);
    setEditValue(currentName);
  };

  const saveEdit = (speakerLabel: string) => {
    const trimmed = editValue.trim();
    if (trimmed) {
      onEdit(speakerLabel, trimmed);
    }
    setEditingSpeaker(null);
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>
            {t("speakerIdentification.bannerTitle", {
              count: applied.length + suggested.length,
            })}
          </span>
          {expanded ? (
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-full"
          onClick={onDismiss}
        >
          {t("speakerIdentification.dismissAll")}
        </Button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {applied.map((s) => (
            <div
              key={s.speaker_label}
              className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">{s.speaker_label}</span>
              <span className="text-muted-foreground">→</span>

              {editingSpeaker === s.speaker_label ? (
                <div className="inline-flex items-center gap-1">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(s.speaker_label);
                      if (e.key === "Escape") setEditingSpeaker(null);
                    }}
                    className="h-6 w-24 text-xs border-none shadow-none px-1.5 py-0 focus-visible:ring-0 bg-transparent"
                    maxLength={30}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => saveEdit(s.speaker_label)}
                  >
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => setEditingSpeaker(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {s.inferred_name}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground/60 cursor-help underline decoration-dotted underline-offset-2">
                        {t("speakerIdentification.evidence")}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="text-xs max-w-xs"
                    >
                      {s.evidence.map((e, i) => (
                        <p key={i} className="italic">
                          "{e.length > 100 ? e.slice(0, 100) + "…" : e}"
                        </p>
                      ))}
                    </TooltipContent>
                  </Tooltip>
                  <div className="ml-auto flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        startEdit(s.speaker_label, s.inferred_name)
                      }
                      aria-label={t("speakerIdentification.edit")}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      onClick={() => onUndo(s.speaker_label)}
                      aria-label={t("speakerIdentification.undo")}
                    >
                      <Undo2 className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}

          {suggested.map((s) => (
            <div
              key={s.speaker_label}
              className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">{s.speaker_label}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium text-foreground/80">
                {s.inferred_name}
              </span>
              
              <span className="text-[10px] text-muted-foreground/50 px-1.5 py-0.5 rounded-full bg-muted/50">
                {t("speakerIdentification.suggested")}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground/60 cursor-help underline decoration-dotted underline-offset-2">
                    {t("speakerIdentification.evidence")}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs max-w-xs">
                  {s.evidence.map((e, i) => (
                    <p key={i} className="italic">
                      "{e.length > 100 ? e.slice(0, 100) + "…" : e}"
                    </p>
                  ))}
                </TooltipContent>
              </Tooltip>
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-primary hover:text-primary"
                  onClick={() => onAccept(s.speaker_label, s.inferred_name)}
                  aria-label={t("speakerIdentification.accept")}
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => onReject(s.speaker_label)}
                  aria-label={t("speakerIdentification.reject")}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
