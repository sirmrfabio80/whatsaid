import { useTranslation } from "react-i18next";

export function TranscriptMock() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col h-full" aria-hidden="true">
      {/* Speaker chips */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[
          { name: "Sarah", dot: "bg-primary" },
          { name: "Marco", dot: "bg-accent" },
          { name: "Priya", dot: "bg-muted-foreground/50" },
        ].map((s) => (
          <span
            key={s.name}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px]"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            <span className="font-serif italic text-foreground">{s.name}</span>
          </span>
        ))}
      </div>

      {/* Lines */}
      <div className="space-y-3 flex-1">
        {[
          { name: "Sarah", time: "00:14", text: "We need to ship before Q2 — that's the bar.", dot: "bg-primary" },
          { name: "Marco", time: "00:22", text: "Agreed. I'll own the rollout plan.", dot: "bg-accent" },
          { name: "Priya", time: "00:31", text: "Let's review next Tuesday with design.", dot: "bg-muted-foreground/50" },
        ].map((l) => (
          <div key={l.time} className="flex items-start gap-2.5">
            <span className={`mt-2 w-1.5 h-1.5 rounded-full ${l.dot} shrink-0`} />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-serif italic text-caption text-foreground">{l.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{l.time}</span>
              </div>
              <p className="font-serif text-caption text-foreground/80 leading-relaxed">{l.text}</p>
            </div>
          </div>
        ))}

        {/* Edit-mode line */}
        <div className="flex items-start gap-2.5">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-serif italic text-caption text-foreground">Sarah</span>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">00:47</span>
            </div>
            <div className="rounded-md border-2 border-primary/60 bg-primary/5 px-2 py-1">
              <p className="font-serif text-caption text-foreground leading-relaxed">
                I'll commit to the launch date<span className="inline-block w-px h-3 bg-primary ml-0.5 align-middle animate-pulse" />
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
        {t("home.outcomeTranscriptCaption")}
      </p>
    </div>
  );
}
