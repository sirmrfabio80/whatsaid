import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function HomeMiniFAQ() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const items = [
    { q: "home.miniFaqQ1", a: "home.miniFaqA1" },
    { q: "home.miniFaqQ2", a: "home.miniFaqA2" },
    { q: "home.miniFaqQ3", a: "home.miniFaqA3" },
    { q: "home.miniFaqQ4", a: "home.miniFaqA4" },
  ];

  const ctaHref = user ? "/convert" : "/signup";

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <div className="grid md:grid-cols-2 gap-10 lg:gap-16 max-w-5xl mx-auto">
        <div className="md:pt-2">
          <p className="font-serif italic text-caption text-primary mb-3">
            {t("home.miniFaqEyebrow")}
          </p>
          <h2 className="text-h1 sm:text-[1.875rem] mb-3">
            {t("home.miniFaqTitle")}
          </h2>
          <p className="font-serif text-body text-muted-foreground mb-5 leading-relaxed">
            {t("home.miniFaqDesc")}
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-2">
            <Button
              size="lg"
              className="h-12 px-6 text-base font-medium rounded-lg"
              onClick={() => navigate(ctaHref)}
            >
              {t("home.miniFaqClosingCta")}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Link
              to="/help"
              className="text-primary hover:underline text-[13px] leading-[1.5] font-medium"
            >
              {t("home.miniFaqSeeAll")} →
            </Link>
          </div>
        </div>
        <div>
          <Accordion type="single" collapsible className="space-y-2">
            {items.map(({ q, a }, i) => (
              <AccordionItem
                key={i}
                value={`mini-faq-${i}`}
                className="border-b border-border/60 last:border-b-0 px-0"
              >
                <AccordionTrigger className="text-[13px] leading-[1.5] font-medium py-4 hover:no-underline text-left">
                  {t(q)}
                </AccordionTrigger>
                <AccordionContent className="font-serif text-body text-muted-foreground pb-4 leading-relaxed">
                  {t(a)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
