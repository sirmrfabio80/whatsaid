import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function PrivacyLinkedText({ text }: { text: string }) {
  if (!text.includes("<privacyLink>")) return <>{text}</>;
  return (
    <>
      {text.split("<privacyLink>").map((part, i) => {
        if (i === 0) return part;
        const [linkText, rest] = part.split("</privacyLink>");
        return <span key={i}><Link to="/privacy" className="text-primary hover:underline">{linkText}</Link>{rest}</span>;
      })}
    </>
  );
}

function RefundLinkedText({ text }: { text: string }) {
  if (!text.includes("<refundLink>")) return <PrivacyLinkedText text={text} />;
  return (
    <>
      {text.split("<refundLink>").map((part, i) => {
        if (i === 0) return <PrivacyLinkedText key={i} text={part} />;
        const [linkText, rest] = part.split("</refundLink>");
        return <span key={i}><Link to="/refund-policy" className="text-primary hover:underline">{linkText}</Link><PrivacyLinkedText text={rest} /></span>;
      })}
    </>
  );
}

export default function Terms() {
  const { t } = useTranslation();

  const sections = [
    { key: "s1", type: "p" },
    { key: "s2", type: "p" },
    { key: "s3", type: "p" },
    { key: "s4", type: "intro-ul-outro", items: ["s4Item1", "s4Item2", "s4Item3", "s4Item4"] },
    { key: "s5", type: "ul", items: ["s5Item1", "s5Item2", "s5Item3", "s5Item4"] },
    { key: "s6", type: "p" },
    { key: "s7", type: "p" },
    { key: "s8", type: "p" },
    { key: "s9", type: "p" },
    { key: "s10", type: "p" },
    { key: "s11", type: "p" },
    { key: "s12", type: "p" },
    { key: "s13", type: "p" },
    { key: "s14", type: "p" },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground mb-6" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" />{t("common.backToHome")}</Link>
          </Button>

          <h1 className="text-h1 sm:text-[1.875rem] tracking-tight mb-2">{t("terms.title")}</h1>
          <p className="text-body-sm text-muted-foreground mb-8">{t("terms.lastUpdated", { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) })}</p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            {sections.map(({ key, type, items }) => (
              <section key={key}>
                <h2 className="text-h2 mb-2">{t(`terms.${key}Title`)}</h2>

                {type === "p" && (
                  <p className="text-body-sm text-muted-foreground leading-relaxed">
                    <RefundLinkedText text={t(`terms.${key}Body`)} />
                  </p>
                )}

                {type === "ul" && (
                  <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                    {items!.map((item) => <li key={item}>{t(`terms.${item}`)}</li>)}
                  </ul>
                )}

                {type === "intro-ul-outro" && (
                  <>
                    <p className="text-body-sm text-muted-foreground leading-relaxed">{t(`terms.${key}Intro`)}</p>
                    <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                      {items!.map((item) => <li key={item}>{t(`terms.${item}`)}</li>)}
                    </ul>
                    <p className="text-body-sm text-muted-foreground leading-relaxed mt-2">{t(`terms.${key}Outro`)}</p>
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
