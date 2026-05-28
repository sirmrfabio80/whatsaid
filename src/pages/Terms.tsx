import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { PolicyRichText } from "@/components/policy/PolicyRichText";
import { LegalEnglishOnlyBanner } from "@/components/policy/LegalEnglishOnlyBanner";

// Effective date for the current version of the Terms of Service.
// Update this constant on every material change.
const EFFECTIVE_DATE = "30 May 2026";


type Section =
  | { key: string; type: "p" }
  | { key: string; type: "intro-ul"; items: string[]; outro?: string };

const SECTIONS: Section[] = [
  { key: "s1", type: "p" },
  { key: "s2", type: "p" },
  { key: "s3", type: "p" },
  { key: "s4", type: "p" },
  {
    key: "s5",
    type: "intro-ul",
    items: ["s5Item1", "s5Item2", "s5Item3", "s5Item4"],
    outro: "s5Outro",
  },
  {
    key: "s6",
    type: "intro-ul",
    items: ["s6Item1", "s6Item2", "s6Item3", "s6Item4"],
  },
  { key: "s7", type: "p" },
  { key: "s8", type: "p" },
  { key: "s9", type: "p" },
  { key: "s10", type: "p" },
  { key: "s11", type: "p" },
  { key: "s12", type: "p" },
  { key: "s13", type: "p" },
  { key: "s14", type: "p" },
  { key: "s15", type: "p" },
  { key: "s16", type: "p" },
  { key: "s17", type: "p" },
  { key: "s18", type: "p" },
  { key: "s19", type: "p" },

];

export default function Terms() {
  // Force English rendering — see LegalEnglishOnlyBanner for rationale.
  const { i18n } = useTranslation();
  const t = i18n.getFixedT("en");

  usePageMeta({
    title: "Terms of Service — WhatSaid",
    description:
      "WhatSaid terms of service: UK-only eligibility, credit purchases via Paddle, Reg. 37 immediate-supply consent, AI output disclaimer and CRA 2015 statutory rights.",
    canonical: "https://whatsaid.app/terms",
  });

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
              {t("common.backToHome")}
            </Link>
          </Button>

          <LegalEnglishOnlyBanner />

          <h1 className="text-h1 sm:text-[1.875rem] tracking-tight mb-2">
            {t("terms.title")}
          </h1>
          <p className="text-body-sm text-muted-foreground mb-8">
            {t("terms.lastUpdated", { date: EFFECTIVE_DATE })}
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            {SECTIONS.map((s) => (
              <section key={s.key}>
                <h2 className="text-h2 mb-2">{t(`terms.${s.key}Title`)}</h2>

                {s.type === "p" && (
                  <p className="text-body-sm text-muted-foreground leading-relaxed">
                    <PolicyRichText text={t(`terms.${s.key}Body`)} />
                  </p>
                )}

                {s.type === "intro-ul" && (
                  <>
                    <p className="text-body-sm text-muted-foreground leading-relaxed">
                      <PolicyRichText text={t(`terms.${s.key}Intro`)} />
                    </p>
                    <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1 mt-2">
                      {s.items.map((item) => (
                        <li key={item}>
                          <PolicyRichText text={t(`terms.${item}`)} />
                        </li>
                      ))}
                    </ul>
                    {s.outro && (
                      <p className="text-body-sm text-muted-foreground leading-relaxed mt-2">
                        <PolicyRichText text={t(`terms.${s.outro}`)} />
                      </p>
                    )}
                  </>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
