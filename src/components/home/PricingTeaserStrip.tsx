import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";

export function PricingTeaserStrip() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reveal = useScrollReveal();

  const packs = [
    { id: "p1", credits: t("home.pricingPack1"), price: "£4.99", highlight: false, save: null as string | null },
    { id: "p5", credits: t("home.pricingPack5"), price: "£14.99", highlight: true, save: t("home.pricingPackSave40") },
    { id: "p20", credits: t("home.pricingPack20"), price: "£39.99", highlight: false, save: t("home.pricingPackSave60") },
  ];

  return (
    <section ref={reveal.ref} className="container mx-auto px-4 pb-16 sm:pb-24">
      <div
        className={`max-w-5xl mx-auto transition-all duration-700 ${
          reveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        <div className="text-center mb-8">
          <p className="font-serif italic text-caption text-primary mb-3">
            {t("home.pricingTeaserEyebrowNew")}
          </p>
          <h2 className="text-h1 sm:text-[1.875rem] mb-3">
            {t("home.pricingTeaserTitleNew")}
          </h2>
          <p className="text-[13px] leading-[1.5] text-muted-foreground max-w-md mx-auto">
            {t("home.pricingTeaserSubNew")}
          </p>
        </div>

        <div className="flex flex-wrap items-stretch justify-center gap-3 sm:gap-4 mb-8">
          {packs.map((p) => (
            <div
              key={p.id}
              className={`relative flex-1 min-w-[180px] sm:min-w-[200px] rounded-xl bg-card p-5 transition-all ${
                p.highlight
                  ? "border-2 border-primary shadow-lg shadow-primary/10 -translate-y-1"
                  : "border border-border/60 hover:border-border"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                  {t("home.pricingPackPopular")}
                </span>
              )}
              <p className="text-caption text-muted-foreground mb-1">{p.credits}</p>
              <p className="font-serif italic text-[1.75rem] leading-none text-foreground mb-2">
                {p.price}
              </p>
              {p.save && (
                <p className="text-[11px] text-accent font-medium">{p.save}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            size="lg"
            className="h-12 px-7 text-base font-medium rounded-lg w-full sm:w-auto"
            onClick={() => navigate("/pricing")}
          >
            {t("home.pricingTeaserCtaPrimary")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 px-7 text-base font-medium rounded-lg w-full sm:w-auto"
            onClick={() => navigate("/help")}
          >
            {t("home.pricingTeaserCtaSecondary")}
          </Button>
        </div>
      </div>
    </section>
  );
}
