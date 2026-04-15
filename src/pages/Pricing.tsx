import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { initPaddle, openCheckout } from "@/lib/paddle-checkout";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  Check,
  FileText,
  Sparkles,
  MessageSquareText,
  Download,
  FolderOpen,
  UserPlus,
  Upload,
  Zap,
} from "lucide-react";
import {
  usePaddlePricing,
  getPriceForProduct,
  PRICING_PRODUCTS,
  type Currency,
  type PricingProduct,
} from "@/lib/paddle-pricing";

// ---------------------------------------------------------------------------
// Currency toggle
// ---------------------------------------------------------------------------

const CURRENCIES: Currency[] = ["GBP", "USD", "EUR"];

function CurrencySelector({
  value,
  onChange,
}: {
  value: Currency;
  onChange: (c: Currency) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-muted/50 p-1 gap-0.5">
      {CURRENCIES.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-all min-h-[36px] ${
            value === c
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing card
// ---------------------------------------------------------------------------

function PricingCard({
  product,
  formattedPrice,
  loading,
  onCta,
}: {
  product: PricingProduct;
  formattedPrice: string;
  loading: boolean;
  onCta: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      className={`rounded-xl border transition-all relative ${
        product.highlighted
          ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
          : "border-border/60 shadow-sm hover:shadow-md hover:border-primary/20"
      }`}
    >
      {product.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-xs font-semibold rounded-full">
            {t(product.badge)}
          </Badge>
        </div>
      )}
      <CardContent className="p-6 sm:p-8 flex flex-col h-full">
        <h3 className="font-heading text-lg font-semibold mb-1">
          {t(product.title)}
        </h3>
        <p className="text-sm text-muted-foreground mb-5">
          {t(product.subtitle)}
        </p>

        <div className="mb-6">
          {loading ? (
            <Skeleton className="h-10 w-28 rounded-md" />
          ) : (
            <span className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">
              {formattedPrice}
            </span>
          )}
        </div>

        <ul className="space-y-2.5 mb-8 flex-1">
          {product.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <span className="text-muted-foreground">{t(f)}</span>
            </li>
          ))}
        </ul>

        <Button
          size="lg"
          className={`w-full h-12 rounded-xl text-base font-medium ${
            product.highlighted ? "" : "variant-outline"
          }`}
          variant={product.highlighted ? "default" : "outline"}
          onClick={onCta}
        >
          {t(product.cta)}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Pricing() {
  const { t } = useTranslation();
  const { user, refreshCredits } = useAuth();
  const navigate = useNavigate();

  const [selectedCurrency, setSelectedCurrency] = useState<Currency | undefined>(
    undefined
  );
  const { prices, loading, currency, isLocalized } = usePaddlePricing(
    selectedCurrency
  );

  // Initialise Paddle.js on mount
  useEffect(() => {
    initPaddle();
  }, []);

  const heroReveal = useScrollReveal();
  const valueReveal = useScrollReveal();
  const pricingReveal = useScrollReveal();
  const trustReveal = useScrollReveal();
  const howReveal = useScrollReveal();
  const faqReveal = useScrollReveal();
  const ctaReveal = useScrollReveal();

  function handleCta(productId: PricingProduct["id"]) {
    if (!user) {
      navigate(`/signup?intent=purchase&product=${productId}`);
      return;
    }

    const product = PRICING_PRODUCTS.find((p) => p.id === productId);
    if (!product?.paddlePriceId) {
      toast.error(t("pricing.comingSoon"));
      return;
    }

    openCheckout({
      priceId: product.paddlePriceId,
      userId: user.id,
      email: user.email,
      onSuccess: () => {
        toast.success(t("pricing.purchaseSuccess"));
        // Delay to allow webhook to process
        setTimeout(() => refreshCredits(), 3000);
      },
    });
  }

  function handleGetStarted() {
    if (user) {
      navigate("/convert");
    } else {
      navigate("/signup?intent=purchase");
    }
  }

  const displayCurrency = selectedCurrency ?? currency;

  const faqs = [
    { q: "pricing.faqAccountQ", a: "pricing.faqAccountA" },
    { q: "pricing.faqCreditQ", a: "pricing.faqCreditA" },
    { q: "pricing.faqExpireQ", a: "pricing.faqExpireA" },
    { q: "pricing.faqDownloadQ", a: "pricing.faqDownloadA" },
    { q: "pricing.faqSubscriptionQ", a: "pricing.faqSubscriptionA" },
    { q: "pricing.faqVariationQ", a: "pricing.faqVariationA" },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      {/* 1 — Hero */}
      <section ref={heroReveal.ref} className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 py-20 sm:py-28 relative">
          <div
            className={`max-w-3xl mx-auto text-center transition-all duration-700 ${
              heroReveal.isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-5 leading-[1.15]">
              {t("pricing.heroTitle")}
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-3 leading-relaxed">
              {t("pricing.heroSubtitle")}
            </p>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-8">
              {t("pricing.heroSupport")}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                className="h-12 px-8 text-base font-medium rounded-lg"
                onClick={handleGetStarted}
              >
                {t("pricing.heroCtaPrimary")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-12 px-8 text-base rounded-lg"
                onClick={() =>
                  document
                    .getElementById("pricing-cards")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                {t("pricing.heroCtaSecondary")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Value grid */}
      <section
        ref={valueReveal.ref}
        className="bg-muted/30 border-y border-border"
      >
        <div className="container mx-auto px-4 py-16 sm:py-24">
          <div
            className={`text-center mb-12 transition-all duration-700 ${
              valueReveal.isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">
              {t("pricing.valueTitle")}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {t("pricing.valueSubtitle")}
            </p>
          </div>
          <div
            className={`grid sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-5xl mx-auto transition-all duration-700 delay-200 ${
              valueReveal.isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            {[
              {
                icon: FileText,
                title: "pricing.valTranscript",
                desc: "pricing.valTranscriptDesc",
              },
              {
                icon: Sparkles,
                title: "pricing.valSummary",
                desc: "pricing.valSummaryDesc",
              },
              {
                icon: MessageSquareText,
                title: "pricing.valQuestions",
                desc: "pricing.valQuestionsDesc",
              },
              {
                icon: Download,
                title: "pricing.valDownload",
                desc: "pricing.valDownloadDesc",
              },
              {
                icon: FolderOpen,
                title: "pricing.valSaved",
                desc: "pricing.valSavedDesc",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <Card
                key={title}
                className="rounded-xl border-border/50 shadow-sm bg-card"
              >
                <CardContent className="p-5 text-center">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-heading font-semibold text-sm mb-1">
                    {t(title)}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(desc)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Pricing cards */}
      <section
        ref={pricingReveal.ref}
        id="pricing-cards"
        className="container mx-auto px-4 py-16 sm:py-24"
      >
        <div
          className={`text-center mb-10 transition-all duration-700 ${
            pricingReveal.isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">
            {t("pricing.cardsTitle")}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            {t("pricing.cardsSubtitle")}
          </p>
          <CurrencySelector
            value={displayCurrency}
            onChange={(c) => setSelectedCurrency(c)}
          />
        </div>

        <div
          className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto transition-all duration-700 delay-200 ${
            pricingReveal.isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          {PRICING_PRODUCTS.map((product) => {
            const lp = getPriceForProduct(prices, product.id);
            return (
              <PricingCard
                key={product.id}
                product={product}
                formattedPrice={lp?.formatted ?? `£${product.basePriceGBP.toFixed(2)}`}
                loading={loading}
                onCta={() => handleCta(product.id)}
              />
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 max-w-lg mx-auto">
          {t("pricing.disclaimer")}
        </p>
        <p className="text-center text-xs text-muted-foreground mt-3 max-w-lg mx-auto">
          {t("pricing.paddleNote")}
        </p>
        <p className="text-center text-xs text-muted-foreground mt-2 max-w-lg mx-auto">
          {t("pricing.consentPrefix")}{" "}
          <Link to="/terms" className="text-primary hover:underline">{t("footer.terms")}</Link>
          {" "}{t("convert.and")}{" "}
          <Link to="/refund-policy" className="text-primary hover:underline">{t("footer.refundPolicy")}</Link>.
        </p>
      </section>

      {/* Support/trust note */}
      <section className="container mx-auto px-4 pb-8">
        <div className="max-w-lg mx-auto text-center space-y-1">
          <p className="text-sm text-muted-foreground">
            {t("pricing.supportLine")}{" "}
            <a href="mailto:support@whatsaid.app" className="text-primary hover:underline">support@whatsaid.app</a>
          </p>
          <p className="text-xs text-muted-foreground">
            <Link to="/terms" className="hover:underline">{t("footer.terms")}</Link>
            {" · "}
            <Link to="/privacy" className="hover:underline">{t("footer.privacy")}</Link>
            {" · "}
            <Link to="/refund-policy" className="hover:underline">{t("footer.refundPolicy")}</Link>
          </p>
        </div>
      </section>

      {/* 4 — Account/trust */}
      <section
        ref={trustReveal.ref}
        className="bg-muted/30 border-y border-border"
      >
        <div className="container mx-auto px-4 py-16 sm:py-20">
          <div
            className={`max-w-2xl mx-auto text-center transition-all duration-700 ${
              trustReveal.isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <UserPlus className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-heading text-xl sm:text-2xl font-semibold mb-3">
              {t("pricing.trustTitle")}
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t("pricing.trustBody")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("pricing.trustReason")}
            </p>
          </div>
        </div>
      </section>

      {/* 5 — How it works */}
      <section ref={howReveal.ref} className="container mx-auto px-4 py-16 sm:py-24">
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            howReveal.isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">
            {t("pricing.howTitle")}
          </h2>
        </div>
        <div
          className={`grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto transition-all duration-700 delay-200 ${
            howReveal.isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          }`}
        >
          {[
            { icon: UserPlus, step: "1", title: "pricing.howStep1", desc: "pricing.howStep1Desc" },
            { icon: Upload, step: "2", title: "pricing.howStep2", desc: "pricing.howStep2Desc" },
            { icon: Zap, step: "3", title: "pricing.howStep3", desc: "pricing.howStep3Desc" },
          ].map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div className="text-xs font-medium text-primary mb-1">
                {t("home.step", { number: step })}
              </div>
              <h3 className="font-heading font-semibold text-lg mb-2">
                {t(title)}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t(desc)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 6 — FAQ */}
      <section
        ref={faqReveal.ref}
        className="bg-muted/30 border-y border-border"
      >
        <div className="container mx-auto px-4 py-16 sm:py-24">
          <div
            className={`text-center mb-10 transition-all duration-700 ${
              faqReveal.isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">
              {t("pricing.faqTitle")}
            </h2>
          </div>
          <div
            className={`max-w-2xl mx-auto transition-all duration-700 delay-200 ${
              faqReveal.isVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map(({ q, a }, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-card border border-border/50 rounded-xl px-5"
                >
                  <AccordionTrigger className="text-sm font-medium py-4 hover:no-underline">
                    {t(q)}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-4">
                    {t(a)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* 7 — Final CTA */}
      <section ref={ctaReveal.ref} className="container mx-auto px-4 py-16 sm:py-24">
        <div
          className={`max-w-2xl mx-auto text-center transition-all duration-700 ${
            ctaReveal.isVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-4">
            {t("pricing.finalTitle")}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            {t("pricing.finalBody")}
          </p>
          <Button
            size="lg"
            className="h-12 px-8 text-base font-medium rounded-lg"
            onClick={handleGetStarted}
          >
            {user ? t("pricing.finalCtaLoggedIn") : t("pricing.finalCta")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>
    </div>
  );
}
