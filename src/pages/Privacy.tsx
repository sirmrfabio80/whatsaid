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
      "How WhatSaid handles your audio, transcripts, and personal data. Audio is deleted after processing — only the generated text is retained.",
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

            <section>
              <h2 className="text-h2 mb-2">Cookies and similar technologies</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                WhatSaid only uses storage that is strictly necessary to keep
                you signed in, remember your language, and keep the app
                working. We do not use analytics, advertising, or session-replay
                cookies. A full inventory and how to clear each item is
                available on our <Link to="/cookies" className="underline hover:text-foreground">cookies page</Link>.
                Lawful bases: PECR regulation 6 and UK GDPR Article 6(1)(f).
              </p>
            </section>

            <section id="uploader-duties" className="scroll-mt-24">
              <h2 className="text-h2 mb-2">Your responsibilities when uploading others’ voices</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                When you upload a recording, you are the controller of any personal
                data it contains under UK GDPR. Before we process the file you
                must confirm a lawful basis under Article 6 — typically your own
                voice only, the speakers’ consent, the necessity of a contract,
                or another lawful ground. Where the recording contains
                identifiable people other than you, Article 14 requires you to
                inform them their voice is being transcribed, unless a
                14(5) exemption applies. We record this attestation per upload
                and store it against the job for audit. The audio itself is
                deleted from our servers and from our transcription provider
                immediately after the transcript is produced.
                See the{" "}
                <a
                  className="underline hover:text-foreground"
                  href="https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ICO guidance on lawful basis
                </a>{" "}
                for more.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
