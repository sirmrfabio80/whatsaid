import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

export function QAMock() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full" aria-hidden="true">
      <div className="space-y-4 flex-1">
        {/* Question bubble */}
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/12 ring-1 ring-primary/20 px-3.5 py-2.5">
            <p className="text-caption text-foreground leading-snug">
              What did Sarah commit to?
            </p>
          </div>
        </div>

        {/* Answer */}
        <div className="rounded-xl border border-border/60 bg-card/60 p-3.5">
          <p className="font-serif text-caption text-foreground/85 leading-relaxed mb-3">
            Sarah committed to the launch date contingent on engineering sign-off by Friday, and to a Tuesday design review.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-mono">Cited from</span>
            {["00:14", "00:31", "00:47"].map((c) => (
              <span
                key={c}
                /* Bumped from bg-accent/10 + text-accent to /15 + text-accent-foreground-ish
                   shade so the chip clears WCAG AA (4.5:1) on tinted background. */
                className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent-foreground border border-accent/30 px-1.5 py-0.5 text-[10px] font-mono tabular-nums"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Add-another affordance */}
        <button
          type="button"
          tabIndex={-1}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-default"
        >
          <Plus className="w-3 h-3" />
          Add another transcript
        </button>
      </div>

      <p className="mt-4 pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
        {t("home.outcomeQACaption")}
      </p>
    </div>
  );
}
