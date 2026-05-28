import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  STORAGE_INVENTORY,
  type StorageCategory,
  type StorageEntry,
} from "@/lib/cookie-inventory";
import { pick, COOKIES_PAGE_STRINGS as S } from "@/lib/cookie-notice-strings";

const ORDER: StorageCategory[] = [
  "strictly_necessary",
  "functional",
  "analytics",
  "marketing",
];

function categoryHeading(cat: StorageCategory, lang: string | undefined) {
  switch (cat) {
    case "strictly_necessary":
      return pick(S.categoryStrictlyNecessary, lang);
    case "functional":
      return pick(S.categoryFunctional, lang);
    case "analytics":
      return pick(S.categoryAnalytics, lang);
    case "marketing":
      return pick(S.categoryMarketing, lang);
  }
}

export default function Cookies() {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  usePageMeta({
    title: pick(S.metaTitle, lang),
    description: pick(S.metaDescription, lang),
    canonical: "https://whatsaid.app/cookies",
  });

  const grouped: Record<StorageCategory, StorageEntry[]> = {
    strictly_necessary: [],
    functional: [],
    analytics: [],
    marketing: [],
  };
  for (const entry of STORAGE_INVENTORY) grouped[entry.category].push(entry);

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground mb-6"
            asChild
          >
            <Link to="/">
              <ArrowLeft className="w-4 h-4" />
              {pick(S.backLink, lang)}
            </Link>
          </Button>

          <h1 className="text-h1 sm:text-[1.875rem] tracking-tight mb-3">
            {pick(S.heading, lang)}
          </h1>

          <p className="text-body-sm text-muted-foreground leading-relaxed mb-4">
            {pick(S.intro, lang)}
          </p>
          <p className="text-body-sm text-muted-foreground leading-relaxed mb-4">
            {pick(S.legalBasis, lang)}
          </p>

          <section className="mt-8 space-y-3">
            <h2 className="text-h2">{pick(S.clearTitle, lang)}</h2>
            <p className="text-body-sm text-muted-foreground leading-relaxed">
              {pick(S.clearBody, lang)}
            </p>
          </section>

          <section className="mt-8 space-y-3">
            <h2 className="text-h2">{pick(S.thirdPartyTitle, lang)}</h2>
            <p className="text-body-sm text-muted-foreground leading-relaxed">
              {pick(S.thirdPartyBody, lang)}
            </p>
          </section>

          <div className="mt-10 space-y-10">
            {ORDER.map((cat) => (
              <section key={cat}>
                <h2 className="text-h2 mb-3">{categoryHeading(cat, lang)}</h2>
                {grouped[cat].length === 0 ? (
                  <p className="text-body-sm text-muted-foreground">
                    {pick(S.emptyCategory, lang)}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-body-sm">
                      <thead className="bg-muted/40 text-left text-caption uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-medium">{pick(S.colKey, lang)}</th>
                          <th className="px-3 py-2 font-medium">{pick(S.colStorage, lang)}</th>
                          <th className="px-3 py-2 font-medium">{pick(S.colProvider, lang)}</th>
                          <th className="px-3 py-2 font-medium">{pick(S.colPurpose, lang)}</th>
                          <th className="px-3 py-2 font-medium">{pick(S.colRetention, lang)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[cat].map((entry) => (
                          <tr
                            key={`${entry.storage}:${entry.key}`}
                            className="border-t border-border align-top"
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              {entry.key}
                              {entry.match === "prefix" ? "*" : ""}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{entry.storage}</td>
                            <td className="px-3 py-2 text-muted-foreground">{entry.provider}</td>
                            <td className="px-3 py-2 text-muted-foreground leading-relaxed">
                              {pick(entry.purpose, lang)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground leading-relaxed">
                              {pick(entry.retention, lang)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
