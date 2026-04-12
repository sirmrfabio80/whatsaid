import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Terms() {
  const { t } = useTranslation();

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground mb-6" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" />{t("common.backToHome")}</Link>
          </Button>

          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-2">{t("terms.title")}</h1>
          <p className="text-sm text-muted-foreground mb-8">{t("terms.lastUpdated", { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) })}</p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s1Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("terms.s1Body").split("<privacyLink>").map((part, i) => {
                  if (i === 0) return part;
                  const [linkText, rest] = part.split("</privacyLink>");
                  return <span key={i}><Link to="/privacy" className="text-primary hover:underline">{linkText}</Link>{rest}</span>;
                })}
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s2Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s2Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s3Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s3Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s4Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s4Intro")}</p>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li>{t("terms.s4Item1")}</li>
                <li>{t("terms.s4Item2")}</li>
                <li>{t("terms.s4Item3")}</li>
                <li>{t("terms.s4Item4")}</li>
              </ul>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">{t("terms.s4Outro")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s5Title")}</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li>{t("terms.s5Item1")}</li>
                <li>{t("terms.s5Item2")}</li>
                <li>{t("terms.s5Item3")}</li>
                <li>{t("terms.s5Item4")}</li>
              </ul>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s6Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s6Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s7Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("terms.s7Body").split("<privacyLink>").map((part, i) => {
                  if (i === 0) return part;
                  const [linkText, rest] = part.split("</privacyLink>");
                  return <span key={i}><Link to="/privacy" className="text-primary hover:underline">{linkText}</Link>{rest}</span>;
                })}
              </p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s8Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s8Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s9Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s9Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s10Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s10Body")}</p>
            </section>
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">{t("terms.s11Title")}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("terms.s11Body")}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
