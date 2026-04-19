import { useTranslation } from "react-i18next";
import { Check, ArrowRight } from "lucide-react";

export function SummaryMock() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full" aria-hidden="true">
      <div className="space-y-4 flex-1">
        <div>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground mb-2">KEY POINTS</p>
          <ul className="space-y-2">
            {[
              "Ship target locked for end of Q2",
              "Marco to own the rollout plan",
              "Design review scheduled for Tuesday",
            ].map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <span className="font-serif text-caption text-foreground/85 leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-wider text-muted-foreground mb-2">ACTIONS</p>
          <ul className="space-y-2">
            {[
              { who: "Marco", what: "Draft rollout plan by Friday" },
              { who: "Sarah", what: "Confirm engineering sign-off" },
            ].map((a) => (
              <li key={a.what} className="flex items-start gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                <span className="font-serif text-caption text-foreground/85 leading-relaxed">
                  <span className="font-serif italic text-foreground">{a.who}</span> — {a.what}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">Updated just now</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-accent">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          in sync
        </span>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        {t("home.outcomeSummaryCaption")}
      </p>
    </div>
  );
}
