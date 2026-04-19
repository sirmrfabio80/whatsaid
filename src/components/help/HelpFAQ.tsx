import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { faq, type FaqGroup } from "@/content/help/faq";
import { pickLocale } from "@/content/help/pickLocale";
import HelpFaqFeedback from "@/components/help/HelpFaqFeedback";

interface HelpFAQProps {
  filter: string;
}

function itemAnchor(groupId: string, itemId: string) {
  return `faq-${groupId}-${itemId}`;
}

export default function HelpFAQ({ filter }: HelpFAQProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [openValues, setOpenValues] = useState<string[]>([]);

  const filteredGroups: FaqGroup[] = useMemo(() => {
    if (!filter) return faq;
    return faq
      .map((g) => {
        const gTitle = pickLocale(g.title, i18n.language);
        const items = g.items.filter((it) => {
          const haystack = `${gTitle} ${pickLocale(it.q, i18n.language)} ${pickLocale(it.a, i18n.language)}`;
          return haystack.toLowerCase().includes(filter.toLowerCase());
        });
        return { ...g, items };
      })
      .filter((g) => g.items.length > 0);
  }, [filter, i18n.language]);

  // Open accordion item targeted by URL hash on mount / hash change
  useEffect(() => {
    const hash = location.hash.replace(/^#/, "");
    if (hash.startsWith("faq-")) {
      setOpenValues((prev) => (prev.includes(hash) ? prev : [...prev, hash]));
      // Defer so DOM has rendered the accordion content section
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } else if (hash.startsWith("faq-pricing-credits") || hash === "faq-pricing-credits") {
      // group anchor — no-op, group section is already scrollable
    }
  }, [location.hash]);

  if (filter && filteredGroups.length === 0) return null;

  return (
    <section id="faq" className="container mx-auto px-5 sm:px-6 py-10 scroll-mt-24">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold mb-1">{t("help.faq.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("help.faq.lead")}</p>
      </div>

      <div className="space-y-8">
        {filteredGroups.map((group) => (
          <div key={group.id} id={`faq-${group.id}`} className="scroll-mt-24">
            <h3 className="text-base font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              {pickLocale(group.title, i18n.language)}
            </h3>
            <Accordion
              type="multiple"
              value={openValues}
              onValueChange={setOpenValues}
              className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden"
            >
              {group.items.map((item) => {
                const anchor = itemAnchor(group.id, item.id);
                return (
                  <AccordionItem key={anchor} value={anchor} id={anchor} className="border-0 px-4 sm:px-5 scroll-mt-24">
                    <AccordionTrigger className="text-left py-4 hover:no-underline">
                      <span className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium text-sm sm:text-base leading-snug">
                          {pickLocale(item.q, i18n.language)}
                        </span>
                        {item.highlighted && (
                          <Badge variant="secondary" className="text-micro uppercase tracking-wide shrink-0">
                            {t("help.faq.mostAsked")}
                          </Badge>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                      <div>{pickLocale(item.a, i18n.language)}</div>
                      <HelpFaqFeedback anchor={anchor} />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        ))}
      </div>
    </section>
  );
}
