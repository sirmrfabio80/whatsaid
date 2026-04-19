import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { HelpStudioMock } from "./HelpStudioMock";

interface HelpHeroProps {
  query: string;
  onQueryChange: (q: string) => void;
}

export default function HelpHero({ query, onQueryChange }: HelpHeroProps) {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden">
      {/* Off-axis decorative orb (desktop only) — matches homepage / pricing identity */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute top-6 right-[-8rem] w-[24rem] h-[24rem] rounded-full bg-primary/10 blur-3xl pointer-events-none"
      />

      <div className="container mx-auto px-5 sm:px-6 pt-10 pb-6 sm:pt-14 sm:pb-10 relative">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center max-w-6xl mx-auto">
          {/* Left: copy + search */}
          <div className="lg:col-span-5 text-center lg:text-left motion-safe:animate-hero-text-rise motion-reduce:animate-none">
            <p className="font-serif italic text-caption text-primary mb-3">
              {t("help.eyebrow", { defaultValue: "Help & answers" })}
            </p>
            <h1 className="text-display sm:text-[2.5rem] lg:text-[3rem] mb-3">
              {t("help.title")}
            </h1>
            <p className="font-serif text-body sm:text-lg text-muted-foreground leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0">
              {t("help.lead")}
            </p>
            <div className="relative max-w-md mx-auto lg:mx-0">
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

          {/* Right: Studio mock */}
          <div className="lg:col-span-7">
            <HelpStudioMock />
          </div>
        </div>
      </div>
    </section>
  );
}
