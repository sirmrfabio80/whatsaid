import { useTranslation } from "react-i18next";
import { Pencil, Search, Share2, Download } from "lucide-react";

export function HomeBeyondGrid() {
  const { t } = useTranslation();

  const tiles = [
    { icon: Pencil, title: "home.beyondEditTitle", desc: "home.beyondEditDesc" },
    { icon: Search, title: "home.beyondSearchTitle", desc: "home.beyondSearchDesc" },
    { icon: Share2, title: "home.beyondShareTitle", desc: "home.beyondShareDesc" },
    { icon: Download, title: "home.beyondExportTitle", desc: "home.beyondExportDesc" },
  ];

  return (
    <section className="bg-muted/30 border-y border-border">
      <div className="container mx-auto px-4 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h2 className="text-h1 sm:text-[1.5rem] mb-3">{t("home.beyondTitle")}</h2>
          <p className="text-secondary text-muted-foreground">
            {t("home.beyondDesc")}
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {tiles.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border border-border/60 bg-card p-5 hover:border-primary/30 transition-colors"
            >
              <Icon aria-hidden="true" className="w-5 h-5 text-primary mb-3" />
              <h3 className="text-h3 mb-1.5">{t(title)}</h3>
              <p className="text-secondary text-muted-foreground leading-relaxed">
                {t(desc)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
