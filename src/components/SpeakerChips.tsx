import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pencil, Check, X } from "lucide-react";

const ROLE_SUGGESTIONS = ["Doctor", "Nurse", "Me", "Mum", "Dad", "Receptionist", "Specialist", "Therapist"];

interface SpeakerChipsProps {
  /** Original speaker labels parsed from transcript, e.g. ["Speaker A", "Speaker B"] */
  speakers: string[];
  /** Current name map, e.g. { "Speaker A": "Doctor" } */
  speakerNames: Record<string, string>;
  /** Called when a speaker is renamed */
  onRename: (original: string, newName: string) => void;
  /** Called when all names are reset */
  onReset?: () => void;
}

export default function SpeakerChips({ speakers, speakerNames, onRename }: SpeakerChipsProps) {
  if (speakers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4" role="group" aria-label="Speaker labels">
      <span className="text-xs text-muted-foreground font-medium mr-1">Speakers:</span>
      {speakers.map((speaker) => (
        <SpeakerChip
          key={speaker}
          original={speaker}
          displayName={speakerNames[speaker] || speaker}
          isRenamed={!!speakerNames[speaker]}
          onRename={(newName) => onRename(speaker, newName)}
        />
      ))}
    </div>
  );
}

function SpeakerChip({
  original,
  displayName,
  isRenamed,
  onRename,
}: {
  original: string;
  displayName: string;
  isRenamed: boolean;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setValue(isRenamed ? displayName : "");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing]);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== original) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 rounded-lg border border-primary/50 bg-background px-2 py-1">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          className="h-6 w-24 sm:w-28 text-xs border-0 p-0 focus-visible:ring-0 bg-transparent"
          aria-label={`New name for ${original}`}
          maxLength={30}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={save}
          aria-label="Save name"
        >
          <Check className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={cancel}
          aria-label="Cancel renaming"
        >
          <X className="w-3 h-3" />
        </Button>
        {/* Quick-pick suggestions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-muted-foreground">
              Suggestions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[120px]">
            {ROLE_SUGGESTIONS.map((role) => (
              <DropdownMenuItem
                key={role}
                onClick={() => {
                  onRename(role);
                  setEditing(false);
                }}
                className="text-xs"
              >
                {role}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors min-h-[36px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Rename ${displayName}`}
    >
      <span>{displayName}</span>
      <Pencil className="w-3 h-3 text-muted-foreground" />
    </button>
  );
}
