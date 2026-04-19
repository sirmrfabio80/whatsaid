import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  CreditCard,
  ListChecks,
  FolderOpen,
} from "lucide-react";
import {
  usePaddlePricing,
  getPriceForProduct,
  PRICING_PRODUCTS,
  type Currency,
  type PricingProduct,
} from "@/lib/paddle-pricing";
import { CreditDurationTable } from "@/components/pricing/CreditDurationTable";
import { PerCreditValue } from "@/components/pricing/PerCreditValue";
import { PricingStudioMock } from "@/components/pricing/PricingStudioMock";

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
// Gradient icon badge (shared visual motif w/ homepage)
// ---------------------------------------------------------------------------

function GradientBadge({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center text-primary mb-4"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing card
// ---------------------------------------------------------------------------

function FormattedPrice({ value }: { value: string }) {
  // Split currency symbol (or letters) from numeric portion to render serif italic on the symbol.
  const match = value.match(/^([^\d]+)(.+)$/);
  if (!match) return <>{value}</>;
  const [, symbol, number] = match;
  return (
    <>
      <span className="font-serif italic text-3xl sm:text-4xl text-primary/90">
        {symbol.trim()}
      </span>
      {symbol.endsWith(" ") ? " " : ""}
      <span className="text-display tabular-nums">{number}</span>
    </>
  );
}

function PricingCard({
  product,
  localized,
  formattedPrice,
  loading,
  onCta,
}: {
  product: PricingProduct;
  localized: ReturnType<typeof getPriceForProduct>;
  formattedPrice: string;
  loading: boolean;
  onCta: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card
      className={`rounded-2xl border transition-all relative ${
        product.highlighted
          ? "border-2 border-primary shadow-xl shadow-primary/10 md:scale-[1.02]"
          : "border-border/60 shadow-sm hover:shadow-md hover:border-primary/20"
      }`}
    >
      {product.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3 py-0.5 text-micro rounded-full">
            {t(product.badge)}
          </Badge>
        </div>
      )}
      <CardContent className="p-6 sm:p-8 flex flex-col h-full">
        <h3 className="text-h2 mb-1">{t(product.title)}</h3>
        <p className="text-body-sm text-muted-foreground mb-5">
          {t(product.subtitle)}
        </p>

        <div className="mb-1">
          {loading ? (
            <Skeleton className="h-10 w-28 rounded-md" />
          ) : (
            <span className="inline-flex items-baseline gap-0.5 font-semibold tracking-tight">
              <FormattedPrice value={formattedPrice} />
            </span>
          )}
        </div>
        <PerCreditValue product={product} localized={localized} />

        <ul className="space-y-2.5 mt-6 mb-8 flex-1">
          {product.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-body-sm">
              <Check aria-hidden="true" className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <span className="text-muted-foreground">{t(f)}</span>
            </li>
          ))}
        </ul>

        <Button
          size="lg"
          className="w-full h-12 rounded-xl text-base font-medium"
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
  const { user, creditBalance, refreshCredits } = useAuth();
  const navigate = useNavigate();
  const [processingPurchase, setProcessingPurchase] = useState(false);

  const [selectedCurrency, setSelectedCurrency] = useState<Currency | undefined>(undefined);
  const { prices, loading, currency } = usePaddlePricing(selectedCurrency);

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

    const priorBalance = creditBalance;

    openCheckout({
      priceId: product.paddlePriceId,
      userId: user.id,
      email: user.email,
      successUrl: `${window.location.origin}/convert?purchased=true&priorBalance=${encodeURIComponent(String(priorBalance))}`,
      onSuccess: () => {
        setProcessingPurchase(true);
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          const { data } = await supabase
            .from("credit_balances")
            .select("balance")
            .eq("user_id", user.id)
            .maybeSingle();
          if (data && data.balance > priorBalance) {
            clearInterval(poll);
            setProcessingPurchase(false);
            toast.success(t("pricing.purchaseSuccess"));
            refreshCredits();
          } else if (attempts >= 10) {
            clearInterval(poll);
            setProcessingPurchase(false);
            toast.info(t("pricing.creditsArrivingShortly", "Credits arriving shortly — refresh if needed"));
            refreshCredits();
          }
        }, 2000);
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

  const valueTiles = [
    { icon: FileText, title: "pricing.valTranscript", desc: "pricing.valTranscriptDesc" },
    { icon: Sparkles, title: "pricing.valSummary", desc: "pricing.valSummaryDesc" },
    { icon: MessageSquareText, title: "pricing.valQuestions", desc: "pricing.valQuestionsDesc" },
  ];

  const creditSteps = [
    { step: "1", icon: FileText, title: "pricing.howCreditStep1", desc: "pricing.howCreditStep1Desc" },
    { step: "2", icon: CreditCard, title: "pricing.howCreditStep2", desc: "pricing.howCreditStep2Desc" },
    { step: "3", icon: FolderOpen, title: "pricing.howCreditStep3", desc: "pricing.howCreditStep3Desc" },
  ];

  const faqs = [
    { q: "pricing.faqAccountQ", a: "pricing.faqAccountA" },
    { q: "pricing.faqCreditQ", a: "pricing.faqCreditA" },
    { q: "pricing.faqFailedQ", a: "pricing.faqFailedA" },
    { q: "pricing.faqExpireQ", a: "pricing.faqExpireA" },
    { q: "pricing.faqDownloadQ", a: "pricing.faqDownloadA" },
    { q: "pricing.faqShareQ", a: "pricing.faqShareA" },
    { q: "pricing.faqSubscriptionQ", a: "pricing.faqSubscriptionA" },
    { q: "pricing.faqVariationQ", a: "pricing.faqVariationA" },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat relative">
      {/* Processing purchase overlay */}
      {processingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-lg">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-lg font-medium text-foreground">
              {t("pricing.processingPurchase", "Processing purchase…")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("pricing.processingPurchaseDesc", "Your credits will appear shortly.")}
            </p>
          </div>
        </div>
      )}

      {/* 1 — Hero — Studio split layout, mirrors homepage hero */}
      <section ref={heroReveal.ref} className="relative overflow-hidden">
        {/* Layered ambient gradients (lg only) — primary top-right + accent bottom-left */}
        <div
          aria-hidden="true"
          className="hidden lg:block absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60rem 32rem at 88% 8%, hsl(var(--primary) / 0.12), transparent 60%), radial-gradient(40rem 24rem at 8% 92%, hsl(var(--accent) / 0.08), transparent 60%)",
          }}
        />
        {/* Mobile/tablet ambient — subtle vertical wash */}
        <div
          aria-hidden="true"
          className="lg:hidden absolute inset-0 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent pointer-events-none"
        />
        <div className="container mx-auto px-4 py-16 sm:py-20 lg:py-24 relative">
          <div
            className={`grid lg:grid-cols-12 gap-10 lg:gap-12 items-center transition-all duration-700 ${
              heroReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            {/* Left column — copy + CTAs */}
            <div className="lg:col-span-5 text-center lg:text-left">
              <p className="font-serif italic text-caption text-primary mb-4">
                {t("pricing.heroEyebrow")}
              </p>
              <h1 className="text-display sm:text-[2.75rem] lg:text-[3.25rem] mb-5">
                {t("pricing.heroTitle")}
              </h1>
              <p className="font-serif text-body sm:text-lg text-muted-foreground max-w-[58ch] mx-auto lg:mx-0 mb-8 leading-relaxed">
                {t("pricing.heroSubtitle")}
              </p>
              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-3 sm:gap-4">
                <Button
                  size="lg"
                  className="h-12 px-8 text-base font-medium rounded-lg shadow-sm hover:shadow-md transition-shadow"
                  onClick={handleGetStarted}
                >
                  {t("pricing.heroCtaPrimary")}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <button
                  type="button"
                  onClick={() =>
                    document
                      .getElementById("credit-table")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="text-body-sm font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5 transition-colors h-12"
                >
                  {t("pricing.heroCtaHowCredits")}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right column — Studio mock */}
            <div className="lg:col-span-7">
              <PricingStudioMock />
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Value tiles */}
      <section ref={valueReveal.ref} className="bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 py-16 sm:py-20">
          <div
            className={`text-center mb-10 transition-all duration-700 ${
              valueReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <h2 className="text-h1 sm:text-[1.875rem] mb-3">{t("pricing.valueTitle")}</h2>
            <p className="font-serif text-body text-muted-foreground max-w-xl mx-auto">
              {t("pricing.valueSubtitle")}
            </p>
          </div>
          <div
            className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto transition-all duration-700 delay-200 ${
              valueReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            {valueTiles.map(({ icon: Icon, title, desc }) => (
              <Card
                key={title}
                className="rounded-2xl border-border/60 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
              >
                <CardContent className="p-6 sm:p-7">
                  <GradientBadge>
                    <Icon className="w-6 h-6" />
                  </GradientBadge>
                  <h3 className="text-h3 mb-2">{t(title)}</h3>
                  <p className="font-serif text-body text-muted-foreground leading-relaxed">
                    {t(desc)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 3 — Credit duration table */}
      <div id="credit-table">
        <CreditDurationTable />
      </div>

      {/* 4 — Pricing cards */}
      <section
        ref={pricingReveal.ref}
        id="pricing-cards"
        className="container mx-auto px-4 pb-16 sm:pb-24"
      >
        <div
          className={`text-center mb-8 transition-all duration-700 ${
            pricingReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="text-h1 sm:text-[1.875rem] mb-3">{t("pricing.cardsTitle")}</h2>
          <p className="text-body-sm text-muted-foreground max-w-md mx-auto mb-5">
            {t("pricing.cardsSubtitle")}
          </p>
          <CurrencySelector value={displayCurrency} onChange={(c) => setSelectedCurrency(c)} />
        </div>

        {/* Microcopy strip */}
        <p className="text-center text-caption text-muted-foreground mb-8">
          {t("pricing.microPayOnce")}
          <span className="mx-2 text-border">·</span>
          {t("pricing.microNoSubscription")}
          <span className="mx-2 text-border">·</span>
          {t("pricing.microSaved")}
        </p>

        <div
          className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto transition-all duration-700 delay-200 ${
            pricingReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {PRICING_PRODUCTS.map((product) => {
            const lp = getPriceForProduct(prices, product.id);
            return (
              <PricingCard
                key={product.id}
                product={product}
                localized={lp}
                formattedPrice={lp?.formatted ?? `£${product.basePriceGBP.toFixed(2)}`}
                loading={loading}
                onCta={() => handleCta(product.id)}
              />
            );
          })}
        </div>

        <p className="text-center text-caption text-muted-foreground mt-8 max-w-lg mx-auto">
          {t("pricing.disclaimer")}
        </p>
        <p className="text-center text-caption text-muted-foreground mt-3 max-w-lg mx-auto">
          {t("pricing.paddleNote")}
        </p>
        <p className="text-center text-caption text-muted-foreground mt-2 max-w-lg mx-auto">
          {t("pricing.consentPrefix")}{" "}
          <Link to="/terms" className="text-primary hover:underline">{t("footer.terms")}</Link>
          {" "}{t("convert.and")}{" "}
          <Link to="/refund-policy" className="text-primary hover:underline">{t("footer.refundPolicy")}</Link>.
        </p>

        <div className="max-w-lg mx-auto text-center space-y-1 mt-8">
          <p className="text-body-sm text-muted-foreground">
            {t("pricing.supportLine")}{" "}
            <a href="mailto:support@whatsaid.app" className="text-primary hover:underline">support@whatsaid.app</a>
          </p>
          <p className="text-caption text-muted-foreground">
            <Link to="/terms" className="hover:underline">{t("footer.terms")}</Link>
            {" · "}
            <Link to="/privacy" className="hover:underline">{t("footer.privacy")}</Link>
            {" · "}
            <Link to="/refund-policy" className="hover:underline">{t("footer.refundPolicy")}</Link>
          </p>
        </div>
      </section>

      {/* 5 — Why an account (gradient card, matches homepage motif) */}
      <section ref={trustReveal.ref} className="container mx-auto px-4 pb-16 sm:pb-24">
        <div
          className={`max-w-4xl mx-auto rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 via-card to-muted/30 p-8 sm:p-12 text-center transition-all duration-700 ${
            trustReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-serif italic text-caption text-primary mb-3">
            {t("pricing.trustEyebrow")}
          </p>
          <h2 className="text-h1 mb-3">{t("pricing.trustTitle")}</h2>
          <p className="font-serif text-body text-muted-foreground leading-relaxed mb-3 max-w-2xl mx-auto">
            {t("pricing.trustBody")}
          </p>
          <p className="text-body-sm text-muted-foreground max-w-2xl mx-auto">
            {t("pricing.trustReason")}
          </p>
        </div>
      </section>

      {/* 6 — How a credit gets used (timeline, matches homepage motif) */}
      <section ref={howReveal.ref} className="container mx-auto px-4 py-16 sm:py-20">
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            howReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="text-h1 sm:text-[1.875rem] mb-3">{t("pricing.howCreditTitle")}</h2>
          <p className="text-body-sm text-muted-foreground max-w-md mx-auto">
            {t("pricing.howCreditSub")}
          </p>
        </div>
        <div
          className={`relative max-w-5xl mx-auto transition-all duration-700 delay-200 ${
            howReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <div
            aria-hidden="true"
            className="hidden md:block absolute left-[12%] right-[12%] top-7 border-t border-dashed border-border"
          />
          <div className="grid md:grid-cols-3 gap-10 md:gap-8 relative">
            {creditSteps.map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="text-center">
                <div
                  aria-hidden="true"
                  className="font-serif italic text-h1 text-primary/40 mb-2 leading-none"
                >
                  {step}
                </div>
                <div
                  aria-hidden="true"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-card border border-border/60 text-primary mb-4"
                >
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="text-h3 mb-2">{t(title)}</h3>
                <p className="text-body-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {t(desc)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7 — FAQ (editorial, matches homepage motif) */}
      <section ref={faqReveal.ref} className="container mx-auto px-4 py-16 sm:py-24">
        <div className="grid md:grid-cols-2 gap-10 lg:gap-16 max-w-5xl mx-auto">
          <div className="md:pt-2">
            <p className="font-serif italic text-caption text-primary mb-3">
              {t("pricing.faqEyebrow")}
            </p>
            <h2 className="text-h1 sm:text-[1.875rem] mb-3">{t("pricing.faqTitle")}</h2>
            <p className="font-serif text-body text-muted-foreground mb-4 leading-relaxed">
              {t("pricing.faqDesc")}
            </p>
            <a
              href="/help#faq-pricing-credits"
              className="text-primary hover:underline text-body-sm font-medium"
            >
              {t("pricing.moreFaqLink")}
            </a>
          </div>
          <div
            className={`transition-all duration-700 ${
              faqReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map(({ q, a }, i) => {
                const isFailedFaq = q === "pricing.faqFailedQ";
                return (
                  <AccordionItem
                    key={i}
                    value={`faq-${i}`}
                    className="border-b border-border/60 last:border-b-0 px-0"
                  >
                    <AccordionTrigger className="text-body-sm font-medium py-4 hover:no-underline text-left">
                      {t(q)}
                    </AccordionTrigger>
                    <AccordionContent className="font-serif text-body text-muted-foreground pb-4 leading-relaxed">
                      {t(a)}
                      {isFailedFaq && (
                        <div className="mt-3 not-italic">
                          <Link
                            to="/refund-policy"
                            className="text-caption text-primary hover:underline font-sans inline-flex items-center gap-1"
                          >
                            {t("pricing.faqFailedRefundLink", { defaultValue: "Read the full refund policy" })}
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </div>
      </section>

      {/* 8 — Final CTA (downgraded weight, no card) */}
      <section ref={ctaReveal.ref} className="container mx-auto px-4 py-16 sm:py-20">
        <div
          className={`max-w-xl mx-auto text-center transition-all duration-700 ${
            ctaReveal.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-serif text-body text-muted-foreground mb-5 leading-relaxed">
            {t("pricing.finalBody")}
          </p>
          <Button
            size="lg"
            className="h-12 px-8 text-base font-medium rounded-lg shadow-sm hover:shadow-md transition-shadow"
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
