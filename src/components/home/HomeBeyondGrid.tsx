import { useTranslation } from "react-i18next";
import { Pencil, Search, Share2, Download, Check } from "lucide-react";

export function HomeBeyondGrid() {
  const { t } = useTranslation();

  return (
    <section className="bg-muted/30 border-y border-border">
      <div className="container mx-auto px-4 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h2 className="text-h1 sm:text-[1.5rem] mb-3">{t("home.beyondTitle")}</h2>
          <p className="text-secondary text-muted-foreground">
            {t("home.beyondDesc")}
          </p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-2 gap-4 max-w-6xl mx-auto">
          {/* Big tile: Edit & rename */}
          <div className="lg:col-span-2 lg:row-span-2 rounded-2xl border border-border/60 bg-card p-6 sm:p-7 hover:border-primary/30 transition-colors flex flex-col">
            <Pencil aria-hidden="true" className="w-5 h-5 text-primary mb-3" />
            <h3 className="text-h3 mb-1.5">{t("home.beyondEditTitle")}</h3>
            <p className="text-secondary text-muted-foreground leading-relaxed mb-5">
              {t("home.beyondEditDesc")}
            </p>

            {/* Mini mock: rename + summary updated */}
            <div aria-hidden="true" className="mt-auto rounded-xl border border-border/50 bg-muted/30 p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-mono">Speaker 1</span>
                <span className="text-muted-foreground">→</span>
                <div className="inline-flex items-center gap-1 rounded-md border-2 border-primary/60 bg-primary/5 px-2 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span className="font-serif italic text-caption text-foreground">Sarah</span>
                  <span className="inline-block w-px h-3 bg-primary ml-0.5 animate-pulse" />
                </div>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent px-2.5 py-1 text-[11px]">
                <Check className="w-3 h-3" />
                Summary updated
              </div>
            </div>
          </div>

          {/* Search & tags */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/30 transition-colors">
            <Search aria-hidden="true" className="w-5 h-5 text-primary mb-3" />
            <h3 className="text-h3 mb-1.5">{t("home.beyondSearchTitle")}</h3>
            <p className="text-secondary text-muted-foreground leading-relaxed mb-4">
              {t("home.beyondSearchDesc")}
            </p>
            <div aria-hidden="true" className="space-y-2">
              <div className="rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 flex items-center gap-2">
                <Search className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono text-[11px] text-foreground">interview</span>
                <span className="inline-block w-px h-3 bg-foreground ml-0.5 animate-pulse" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["product", "q3", "roadmap"].map((tag) => (
                  <span key={tag} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Share & claim */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/30 transition-colors">
            <Share2 aria-hidden="true" className="w-5 h-5 text-primary mb-3" />
            <h3 className="text-h3 mb-1.5">{t("home.beyondShareTitle")}</h3>
            <p className="text-secondary text-muted-foreground leading-relaxed mb-4">
              {t("home.beyondShareDesc")}
            </p>
            <div aria-hidden="true" className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary/15 text-primary inline-flex items-center justify-center text-[11px] font-medium">
                M
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 border border-accent/20 text-accent px-2 py-0.5 text-[10px] font-medium">
                <Check className="w-3 h-3" />
                Claimed
              </span>
            </div>
          </div>

          {/* Export anywhere */}
          <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/30 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <Download aria-hidden="true" className="w-5 h-5 text-primary mb-3" />
                <h3 className="text-h3 mb-1.5">{t("home.beyondExportTitle")}</h3>
                <p className="text-secondary text-muted-foreground leading-relaxed">
                  {t("home.beyondExportDesc")}
                </p>
              </div>
              <div aria-hidden="true" className="hidden sm:flex flex-wrap items-center gap-1.5 max-w-[220px] justify-end">
                {[
                  { l: "TXT", ready: true },
                  { l: "JSON", ready: true },
                  { l: "DOCX", ready: true },
                  { l: "PDF", ready: true, async: true },
                ].map((f) => (
                  <span
                    key={f.l}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-mono text-foreground/80"
                  >
                    {f.l}
                    {f.async && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                  </span>
                ))}
              </div>
            </div>
            {/* Mobile-only chip row */}
            <div aria-hidden="true" className="sm:hidden flex flex-wrap items-center gap-1.5 mt-4">
              {["TXT", "JSON", "DOCX", "PDF"].map((l) => (
                <span key={l} className="inline-flex items-center rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-mono text-foreground/80">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
