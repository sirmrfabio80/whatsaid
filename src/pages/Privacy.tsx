import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground mb-6" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" />{t("common.backToHome")}</Link>
          </Button>

          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-2">{t("privacy.title")}</h1>
          <p className="text-sm text-muted-foreground mb-8">{t("privacy.lastUpdated", { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) })}</p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s1Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s1Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s2Title")}</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li><strong>{t("privacy.s2AccountData")}</strong></li>
                <li><strong>{t("privacy.s2AudioFiles")}</strong></li>
                <li><strong>{t("privacy.s2Transcripts")}</strong></li>
                <li><strong>{t("privacy.s2PaymentMeta")}</strong></li>
                <li><strong>{t("privacy.s2UsageData")}</strong></li>
              </ul>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s3Title")}</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li>{t("privacy.s3Item1")}</li>
                <li>{t("privacy.s3Item2")}</li>
                <li>{t("privacy.s3Item3")}</li>
              </ul>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s4Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed"><strong>{t("privacy.s4Body")}</strong></p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s5Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s5Body1")}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s5Body2")}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s5Body3")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s6Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s6Intro")}</p>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li><strong>{t("privacy.s6AssemblyAI")}</strong></li>
                <li><strong>{t("privacy.s6Stripe")}</strong></li>
                <li><strong>{t("privacy.s6Cloud")}</strong></li>
              </ul>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">{t("privacy.s6Transfer")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s7Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s7Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s8Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s8Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s9Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s9Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s10Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s10Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("privacy.s11Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("privacy.s11Body")}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
