import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface HelpFaqFeedbackProps {
  /** Stable FAQ anchor, e.g. "faq-pricing-credits-credits-cost" */
  anchor: string;
}

const STORAGE_KEY = "help_faq_feedback_v1";

type Vote = "yes" | "no";
type StoredVotes = Record<string, Vote>;

function readStored(): StoredVotes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredVotes) : {};
  } catch {
    return {};
  }
}

function writeStored(next: StoredVotes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode etc.) — silently ignore
  }
}

export default function HelpFaqFeedback({ anchor }: HelpFaqFeedbackProps) {
  const { t, i18n } = useTranslation();
  const [vote, setVote] = useState<Vote | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored[anchor]) setVote(stored[anchor]);
  }, [anchor]);

  const handleVote = async (next: Vote) => {
    if (vote || submitting) return;
    setSubmitting(true);
    setVote(next); // optimistic — feels instant

    const locale = (i18n.language || "en").slice(0, 2);
    const safeLocale = (["en", "it", "fr"] as const).includes(locale as never)
      ? locale
      : "en";

    const { error } = await supabase.from("help_faq_feedback").insert({
      faq_anchor: anchor,
      helpful: next === "yes",
      locale: safeLocale,
    });

    if (error) {
      // Roll back optimistic state so the user can retry
      console.warn("FAQ feedback insert failed", error);
      setVote(null);
      setSubmitting(false);
      return;
    }

    const stored = readStored();
    stored[anchor] = next;
    writeStored(stored);
    setSubmitting(false);
  };

  if (vote) {
    return (
      <div
        className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"
        role="status"
      >
        <Check className="w-3.5 h-3.5 text-primary" aria-hidden />
        <span>{t("help.faq.feedbackThanks")}</span>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <span>{t("help.faq.feedbackPrompt")}</span>
      <button
        type="button"
        onClick={() => handleVote("yes")}
        disabled={submitting}
        aria-label={t("help.faq.feedbackYesAria")}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border",
          "hover:bg-muted hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <ThumbsUp className="w-3.5 h-3.5" aria-hidden />
        <span>{t("help.faq.feedbackYes")}</span>
      </button>
      <button
        type="button"
        onClick={() => handleVote("no")}
        disabled={submitting}
        aria-label={t("help.faq.feedbackNoAria")}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border",
          "hover:bg-muted hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <ThumbsDown className="w-3.5 h-3.5" aria-hidden />
        <span>{t("help.faq.feedbackNo")}</span>
      </button>
    </div>
  );
}
