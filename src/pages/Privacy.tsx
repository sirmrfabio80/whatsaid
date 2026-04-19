import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function Privacy() {
  const { t } = useTranslation();

  usePageMeta({
    title: "Privacy Policy — WhatSaid",
    description:
      "How WhatSaid handles your data: audio files are deleted immediately after processing. Read our full privacy policy.",
    canonical: "https://whatsaid.app/privacy",
  });

  const sections = [
    { title: "privacy.s1Title", type: "p", content: "privacy.s1Body" },
    {
      title: "privacy.s2Title", type: "ul", items: [
        "privacy.s2AccountData", "privacy.s2AudioFiles", "privacy.s2Transcripts",
        "privacy.s2PaymentMeta", "privacy.s2UsageData", "privacy.s2TechnicalData",
      ],
    },
    {
      title: "privacy.s3Title", type: "ul", items: [
        "privacy.s3Item1", "privacy.s3Item2", "privacy.s3Item3",
      ],
    },
    {
      title: "privacy.s4Title", type: "ul", items: [
        "privacy.s4Item1", "privacy.s4Item2", "privacy.s4Item3", "privacy.s4Item4",
      ],
    },
    { title: "privacy.s5Title", type: "multi", paragraphs: ["privacy.s5Body1", "privacy.s5Body2", "privacy.s5Body3"] },
    {
      title: "privacy.s6Title", type: "intro-ul",
      intro: "privacy.s6Intro",
      items: ["privacy.s6AssemblyAI", "privacy.s6Paddle", "privacy.s6Cloud"],
      outro: "privacy.s6Transfer",
    },
    { title: "privacy.s7Title", type: "p", content: "privacy.s7Body" },
    { title: "privacy.s8Title", type: "p", content: "privacy.s8Body" },
    { title: "privacy.s9Title", type: "p", content: "privacy.s9Body" },
    { title: "privacy.s10Title", type: "p", content: "privacy.s10Body" },
    { title: "privacy.s11Title", type: "p", content: "privacy.s11Body" },
    { title: "privacy.s12Title", type: "p", content: "privacy.s12Body" },
    { title: "privacy.s13Title", type: "p", content: "privacy.s13Body" },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground mb-6" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" />{t("common.backToHome")}</Link>
          </Button>

          <h1 className="text-h1 sm:text-[1.875rem] tracking-tight mb-2">{t("privacy.title")}</h1>
          <p className="text-body-sm text-muted-foreground mb-8">{t("privacy.lastUpdated", { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) })}</p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            {sections.map((s, i) => (
              <section key={i}>
                <h2 className="text-h2 mb-2">{t(s.title)}</h2>
                {s.type === "p" && (
                  <p className="text-body-sm text-muted-foreground leading-relaxed">{t(s.content!)}</p>
                )}
                {s.type === "ul" && (
                  <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                    {s.items!.map((item) => <li key={item}><strong>{t(item)}</strong></li>)}
                  </ul>
                )}
                {s.type === "multi" && s.paragraphs!.map((p) => (
                  <p key={p} className="text-body-sm text-muted-foreground leading-relaxed">{t(p)}</p>
                ))}
                {s.type === "intro-ul" && (
                  <>
                    <p className="text-body-sm text-muted-foreground leading-relaxed">{t(s.intro!)}</p>
                    <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                      {s.items!.map((item) => <li key={item}><strong>{t(item)}</strong></li>)}
                    </ul>
                    {s.outro && <p className="text-body-sm text-muted-foreground leading-relaxed mt-2">{t(s.outro)}</p>}
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
