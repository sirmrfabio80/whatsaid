import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

interface HelpHeroProps {
  query: string;
  onQueryChange: (q: string) => void;
}

export default function HelpHero({ query, onQueryChange }: HelpHeroProps) {
  const { t } = useTranslation();

  return (
    <section className="container mx-auto px-5 sm:px-6 pt-10 pb-6 sm:pt-14 sm:pb-8">
      <div className="max-w-3xl mx-auto text-center animate-page-enter">
        <h1 className="text-display sm:text-[2.5rem] lg:text-[3rem] mb-3">
          {t("help.title")}
        </h1>
        <p className="text-body sm:text-lg text-muted-foreground leading-relaxed mb-6 max-w-xl mx-auto">
          {t("help.lead")}
        </p>
        <div className="relative max-w-md mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("help.filterPlaceholder")}
            aria-label={t("help.filterAriaLabel")}
            className="w-full h-11 pl-10 pr-3 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>
    </section>
  );
}
