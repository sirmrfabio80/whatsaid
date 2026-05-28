import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { PolicyRichText } from "@/components/policy/PolicyRichText";
import { LegalEnglishOnlyBanner } from "@/components/policy/LegalEnglishOnlyBanner";

// Effective date for the current version of the Privacy Notice.
// Update this constant on every material change.
const EFFECTIVE_DATE = "30 May 2026";


type Section =
  | { key: string; type: "p" }
  | { key: string; type: "multi"; paragraphs: string[] }
  | { key: string; type: "intro-ul"; items: string[]; outro?: string };

const SECTIONS: Section[] = [
  { key: "s1", type: "p" },
  { key: "s2", type: "p" },
  {
    key: "s3",
    type: "intro-ul",
    items: ["s3Item1", "s3Item2", "s3Item3", "s3Item4", "s3Item5", "s3Item6"],
  },
  {
    key: "s4",
    type: "intro-ul",
    items: ["s4Item1", "s4Item2", "s4Item3", "s4Item4", "s4Item5"],
  },
  { key: "s5", type: "multi", paragraphs: ["s5Body1", "s5Body2"] },
  {
    key: "s6",
    type: "intro-ul",
    items: ["s6Item1", "s6Item2", "s6Item3", "s6Item4", "s6Item5", "s6Item6"],
  },
  {
    key: "s7",
    type: "intro-ul",
    items: ["s7Item1", "s7Item2", "s7Item3"],
  },
  { key: "s8", type: "p" },
  {
    key: "s9",
    type: "intro-ul",
    items: ["s9Item1", "s9Item2", "s9Item3", "s9Item4"],
  },
  { key: "s10", type: "p" },
  { key: "s11", type: "p" },
  { key: "s12", type: "p" },
  { key: "s13", type: "p" },
  { key: "s14", type: "p" },
  { key: "s15", type: "p" },
  { key: "s16", type: "p" },
];

export default function Privacy() {
  // Force English rendering — the IT/FR translations of legal text are not
  // yet solicitor-reviewed. A LegalEnglishOnlyBanner explains this in the
  // user's UI language.
  const { i18n } = useTranslation();
  const t = i18n.getFixedT("en");

  usePageMeta({
    title: "Privacy Notice — WhatSaid",
    description:
      "How WhatSaid handles your audio, transcripts and personal data under UK GDPR — EU-region processing, audio deleted after transcription, full DSR self-service.",
    canonical: "https://whatsaid.app/privacy",
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
            {t("privacy.title")}
          </h1>
          <p className="text-body-sm text-muted-foreground mb-8">
            {t("privacy.lastUpdated", { date: EFFECTIVE_DATE })}
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            {SECTIONS.map((s) => (
              <section
                key={s.key}
                id={s.key === "s12" ? "uploader-duties" : undefined}
                className={s.key === "s12" ? "scroll-mt-24" : undefined}
              >
                <h2 className="text-h2 mb-2">{t(`privacy.${s.key}Title`)}</h2>

                {s.type === "p" && (
                  <p className="text-body-sm text-muted-foreground leading-relaxed">
                    <PolicyRichText text={t(`privacy.${s.key}Body`)} />
                  </p>
                )}

                {s.type === "multi" &&
                  s.paragraphs.map((p) => (
                    <p
                      key={p}
                      className="text-body-sm text-muted-foreground leading-relaxed"
                    >
                      <PolicyRichText text={t(`privacy.${p}`)} />
                    </p>
                  ))}

                {s.type === "intro-ul" && (
                  <>
                    <p className="text-body-sm text-muted-foreground leading-relaxed">
                      <PolicyRichText text={t(`privacy.${s.key}Intro`)} />
                    </p>
                    <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1 mt-2">
                      {s.items.map((item) => (
                        <li key={item}>
                          <PolicyRichText text={t(`privacy.${item}`)} />
                        </li>
                      ))}
                    </ul>
                    {s.outro && (
                      <p className="text-body-sm text-muted-foreground leading-relaxed mt-2">
                        <PolicyRichText text={t(`privacy.${s.outro}`)} />
                      </p>
                    )}
                  </>
                )}
              </section>
            ))}

            {/* Hardcoded English. Added per Art. 13(1)(e) / Art. 14(1)(e) — recipients
                and sub-processors disclosure. Kept outside the locale bundles
                because legal copy is currently English-only (see LegalEnglishOnlyBanner). */}
            <section id="recipients" className="scroll-mt-24">
              <h2 className="text-h2 mb-2">17. Recipients and sub-processors</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                We share personal data only with the processors listed below.
                Each is bound by a written contract under UK GDPR Article 28.
                Audio is sent only to AssemblyAI for speech-to-text and is deleted
                from both WhatSaid storage and AssemblyAI immediately after the
                transcript is returned.
              </p>
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-body-sm border border-border/60 rounded-lg">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="p-2 font-medium">Processor</th>
                      <th className="p-2 font-medium">Role</th>
                      <th className="p-2 font-medium">Region</th>
                      <th className="p-2 font-medium">Chapter V mechanism</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-t border-border/60">
                      <td className="p-2">Lovable Cloud / Supabase</td>
                      <td className="p-2">Database, auth, storage, edge functions</td>
                      <td className="p-2">EU (Ireland)</td>
                      <td className="p-2">No transfer (UK ↔ EU adequacy)</td>
                    </tr>
                    <tr className="border-t border-border/60">
                      <td className="p-2">AssemblyAI</td>
                      <td className="p-2">Speech-to-text (audio is deleted after transcription)</td>
                      <td className="p-2">EU endpoint pinned (Ireland)</td>
                      <td className="p-2">No transfer (UK ↔ EU adequacy)</td>
                    </tr>
                    <tr className="border-t border-border/60">
                      <td className="p-2">Lovable AI Gateway → OpenAI</td>
                      <td className="p-2">Summaries and custom outputs (text only)</td>
                      <td className="p-2">United States</td>
                      <td className="p-2">UK Extension to the EU–US Data Privacy Framework</td>
                    </tr>
                    <tr className="border-t border-border/60">
                      <td className="p-2">Lovable AI Gateway → Google</td>
                      <td className="p-2">Summaries and custom outputs (text only)</td>
                      <td className="p-2">United States</td>
                      <td className="p-2">UK Extension to the EU–US Data Privacy Framework</td>
                    </tr>
                    <tr className="border-t border-border/60">
                      <td className="p-2">Paddle.com Market Ltd</td>
                      <td className="p-2">Merchant of record, billing, payment processing</td>
                      <td className="p-2">United Kingdom (with US sub-processors)</td>
                      <td className="p-2">UK IDTA / DPF where applicable</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-body-sm text-muted-foreground leading-relaxed mt-3">
                We do not sell personal data. We do not share data with advertisers.
                We may disclose data to public authorities where required by law.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

