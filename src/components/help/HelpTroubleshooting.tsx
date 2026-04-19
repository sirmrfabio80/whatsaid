import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { troubleshooting } from "@/content/help/troubleshooting";
import { pickLocale } from "@/content/help/pickLocale";

interface HelpTroubleshootingProps {
  filter: string;
}

export default function HelpTroubleshooting({ filter }: HelpTroubleshootingProps) {
  const { t, i18n } = useTranslation();

  const items = useMemo(() => {
    if (!filter) return troubleshooting;
    return troubleshooting.filter((it) => {
      const haystack = `${pickLocale(it.problem, i18n.language)} ${pickLocale(it.fix, i18n.language)}`;
      return haystack.toLowerCase().includes(filter.toLowerCase());
    });
  }, [filter, i18n.language]);

  if (filter && items.length === 0) return null;

  return (
    <section id="troubleshooting" className="container mx-auto px-5 sm:px-6 py-10 scroll-mt-24">
      <div className="mb-6">
        <h2 className="text-h1 sm:text-[1.5rem] mb-1">
          {t("help.troubleshooting.title")}
        </h2>
        <p className="text-secondary text-muted-foreground">{t("help.troubleshooting.lead")}</p>
      </div>

      <Accordion
        type="multiple"
        className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden"
      >
        {items.map((it) => {
          const anchor = `tr-${it.id}`;
          return (
            <AccordionItem key={anchor} value={anchor} id={anchor} className="border-0 px-4 sm:px-5 scroll-mt-24">
              <AccordionTrigger className="text-left py-4 hover:no-underline">
                <span className="font-medium text-sm sm:text-base leading-snug">
                  {pickLocale(it.problem, i18n.language)}
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-secondary text-muted-foreground leading-relaxed pb-4">
                {pickLocale(it.fix, i18n.language)}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}
