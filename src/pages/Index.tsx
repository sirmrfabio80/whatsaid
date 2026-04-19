import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";

import {
  ArrowRight, Shield, Globe, Trash2, Users, Languages, Upload, Cpu, Download,
} from "lucide-react";
import { HomeOutcomeGrid } from "@/components/home/HomeOutcomeGrid";
import { HomeBeyondGrid } from "@/components/home/HomeBeyondGrid";
import { HomeMiniFAQ } from "@/components/home/HomeMiniFAQ";

export default function Index() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const howItWorks = useScrollReveal();
  const privacy = useScrollReveal();
  const pricingTeaser = useScrollReveal();

  const heroPrimaryHref = user ? "/convert" : "/signup";

  const steps = [
    { step: "1", icon: Upload, title: t("home.stepUploadTitle"), desc: t("home.stepUploadDesc") },
    { step: "2", icon: Cpu, title: t("home.stepProcessTitle"), desc: t("home.stepProcessDesc") },
    { step: "3", icon: Download, title: t("home.stepDownloadTitle"), desc: t("home.stepDownloadDesc") },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      {/* 1 — Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent pointer-events-none" />
        {/* Off-axis decorative orb (desktop only) */}
        <div
          aria-hidden="true"
          className="hidden lg:block absolute top-12 right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-primary/15 blur-3xl pointer-events-none"
        />

        <div className="container mx-auto px-4 py-20 sm:py-28 lg:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <p className="font-serif italic text-caption text-primary/80 mb-5 animate-page-enter">
              {t("home.heroEyebrow")}
            </p>
            <h1 className="text-display sm:text-[3.25rem] lg:text-[4rem] mb-6 animate-page-enter">
              {t("home.heroTitlePart1")}{" "}
              <span className="bg-primary/10 rounded-md px-2 py-0.5 text-primary">
                {t("home.heroTitleHighlight")}
              </span>
              <br className="hidden sm:inline" />
              {" "}{t("home.heroTitlePart2")}
            </h1>
            <p className="font-serif text-body sm:text-lg text-muted-foreground max-w-[60ch] mx-auto mb-8 leading-relaxed animate-page-enter">
              {t("home.heroDescNew")}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 animate-page-enter">
              <Button
                size="lg"
                className="h-12 px-8 text-base font-medium rounded-lg shadow-sm hover:shadow-md transition-shadow"
                onClick={() => navigate(heroPrimaryHref)}
              >
                {t("home.ctaPrimary")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Link
                to="/pricing"
                className="text-secondary font-medium text-foreground hover:text-primary inline-flex items-center gap-1.5 transition-colors"
              >
                {t("home.ctaPricing")}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Trust chips (absorbs old stats strip) */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 animate-page-enter">
              {[
                { icon: Users, label: t("home.trustChipSpeakers") },
                { icon: Languages, label: t("home.trustChipLanguage") },
                { icon: Shield, label: t("home.trustChipPrivacy") },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-caption text-muted-foreground bg-muted/40 border border-border/60 rounded-full px-3 py-1.5"
                >
                  <Icon aria-hidden="true" className="w-3.5 h-3.5 text-primary" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Outcome grid (asymmetric) */}
      <HomeOutcomeGrid />

      {/* 3 — Beyond the transcript (dense, flat — rhythm contrast) */}
      <HomeBeyondGrid />

      {/* 4 — How it works (typographic timeline) */}
      <section ref={howItWorks.ref} className="container mx-auto px-4 py-16 sm:py-24">
        <div
          className={`text-center mb-12 transition-all duration-700 ${
            howItWorks.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <h2 className="text-h1 sm:text-[1.875rem] mb-3">{t("home.howItWorksTitle")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{t("home.howItWorksDesc")}</p>
        </div>

        <div
          className={`relative max-w-5xl mx-auto transition-all duration-700 delay-200 ${
            howItWorks.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Dashed connector line on md+ */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute left-[12%] right-[12%] top-7 border-t border-dashed border-border"
          />
          <div className="grid md:grid-cols-3 gap-10 md:gap-8 relative">
            {steps.map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="text-center relative">
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
                <h3 className="text-h3 mb-2">{title}</h3>
                <p className="text-secondary text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — Privacy & trust (gradient card) */}
      <section ref={privacy.ref} className="container mx-auto px-4 pb-16 sm:pb-24">
        <div
          className={`max-w-5xl mx-auto rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 via-card to-muted/30 p-8 sm:p-12 transition-all duration-700 ${
            privacy.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-start">
            <div>
              <p className="font-serif italic text-caption text-primary/80 mb-3">
                {t("home.privacyEyebrow")}
              </p>
              <h2 className="text-h1 mb-3">{t("home.privacyTitle")}</h2>
              <p className="font-serif text-body text-muted-foreground leading-relaxed">
                {t("home.privacyBody")}
              </p>
            </div>
            <ul className="space-y-4">
              {[
                { icon: Trash2, label: t("home.privacyBullet1") },
                { icon: Globe, label: t("home.privacyBullet2") },
                { icon: Shield, label: t("home.privacyBullet3") },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center mt-0.5"
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-secondary text-foreground/90 leading-relaxed">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 6 — Pricing teaser */}
      <section ref={pricingTeaser.ref} className="container mx-auto px-4 pb-16 sm:pb-24">
        <div
          className={`max-w-4xl mx-auto rounded-2xl border-2 border-primary/20 bg-primary/5 p-8 sm:p-12 text-center transition-all duration-700 ${
            pricingTeaser.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="font-serif italic text-caption text-primary/80 mb-3">
            {t("home.pricingTeaserEyebrow")}
          </p>
          <h2 className="text-h1 sm:text-[1.875rem] mb-3">
            {t("home.pricingTeaserHeadlinePrefix")}{" "}
            <span className="font-serif italic text-primary">£4.99</span>
            {t("home.pricingTeaserHeadlineSuffix")}
          </h2>
          <p className="text-secondary text-muted-foreground max-w-md mx-auto mb-6">
            {t("home.pricingTeaserSub")}
          </p>
          <Button
            size="lg"
            className="h-12 px-8 text-base font-medium rounded-lg shadow-sm hover:shadow-md transition-shadow"
            onClick={() => navigate("/pricing")}
          >
            {t("home.pricingTeaserCta")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* 7 — Mini FAQ */}
      <HomeMiniFAQ />
    </div>
  );
}
