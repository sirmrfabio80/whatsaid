import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { useGeoCheck } from "@/hooks/use-geo-check";
import { RegionBlockedNotice } from "@/components/RegionBlockedNotice";

import {
  ArrowRight, Shield, Globe, Trash2, Users, Languages, Upload, Cpu, Download,
} from "lucide-react";
import { HomeOutcomeGrid } from "@/components/home/HomeOutcomeGrid";
import { HomeBeyondGrid } from "@/components/home/HomeBeyondGrid";
import { HomeMiniFAQ } from "@/components/home/HomeMiniFAQ";
import { HeroProductMock } from "@/components/home/HeroProductMock";
import { PricingTeaserStrip } from "@/components/home/PricingTeaserStrip";
import { usePageMeta } from "@/hooks/use-page-meta";
import { JsonLd } from "@/components/seo/JsonLd";

const SOFTWARE_APP_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "WhatSaid",
  url: "https://whatsaid.app/",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Upload audio files and get transcripts with speaker labels, summaries, key actions, and custom AI answers. Supports .m4a, .mp3, .wav.",
  offers: {
    "@type": "Offer",
    price: "4.99",
    priceCurrency: "GBP",
    availability: "https://schema.org/InStock",
    url: "https://whatsaid.app/pricing",
  },
};

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What does one credit include?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "One credit processes one audio file and includes the full transcript, structured summary, and Q&A — all saved in your account. The number of credits depends on audio length (see the credit table on the pricing page).",
      },
    },
    {
      "@type": "Question",
      name: "Do credits expire?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Credits remain available in your account based on the product terms. They don't disappear after a few days.",
      },
    },
    {
      "@type": "Question",
      name: "Can I download my results?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — TXT, JSON, and DOCX download immediately. PDF is generated in the background and saved when ready.",
      },
    },
    {
      "@type": "Question",
      name: "What happens to my audio file?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It's deleted immediately after processing. Only your transcript, summary and outputs are kept in your account.",
      },
    },
  ],
};

export default function Index() {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const howItWorks = useScrollReveal();
  const privacy = useScrollReveal();

  usePageMeta({
    title: "WhatSaid — AI Audio Transcription with Speaker Labels",
    description:
      "Upload audio files and get fast, accurate transcriptions with speaker labels, summaries, and custom AI analysis. Supports .m4a, .mp3, .wav. No subscription required.",
    canonical: "https://whatsaid.app/",
  });

  const heroPrimaryHref = user ? "/convert" : "/signup";

  const steps = [
    { step: "1", icon: Upload, title: t("home.stepUploadTitle"), desc: t("home.stepUploadDesc") },
    { step: "2", icon: Cpu, title: t("home.stepProcessTitle"), desc: t("home.stepProcessDesc") },
    { step: "3", icon: Download, title: t("home.stepDownloadTitle"), desc: t("home.stepDownloadDesc") },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <JsonLd data={SOFTWARE_APP_SCHEMA} />
      <JsonLd data={FAQ_SCHEMA} />
      {/* 1 — Hero (split layout) */}
      <section className="relative overflow-hidden">
        {/* Layered ambient field */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60rem 40rem at 90% -10%, hsl(var(--primary) / 0.15), transparent 60%), radial-gradient(40rem 30rem at -10% 90%, hsl(var(--accent) / 0.08), transparent 60%)",
          }}
        />

        <div className="container mx-auto px-4 py-8 sm:py-12 md:py-10 lg:py-24 relative">
          <div className="grid md:grid-cols-12 gap-6 md:gap-12 lg:gap-12 items-center">
            {/* Left: text */}
            <div className="md:col-span-5 text-center md:text-left motion-safe:animate-hero-text-rise motion-reduce:animate-none">
              <p className="font-serif italic text-caption text-primary mb-4 md:mb-3">
                {t("home.heroEyebrow")}
              </p>
              <h1 className="text-[2.5rem] sm:text-[3.25rem] md:text-[2.25rem] lg:text-[3.5rem] xl:text-[4.25rem] font-semibold tracking-tight leading-[1.05] mb-4 md:mb-4">
                {t("home.heroTitlePart1")}{" "}
                <span className="font-serif italic text-primary">
                  {t("home.heroTitleHighlight")}
                </span>{" "}
                {t("home.heroTitlePart2")}
              </h1>
              <p className="font-serif text-body lg:text-lg text-muted-foreground max-w-[52ch] mx-auto md:mx-0 md:max-w-[38ch] lg:max-w-[52ch] mb-5 md:mb-4 lg:mb-6 leading-relaxed">
                {t("home.heroSubline")}
              </p>

              {/* Trust chips — light, no border */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 mb-6 md:mb-5 lg:mb-7 text-caption text-muted-foreground">
                {[
                  { icon: Users, label: t("home.trustChipSpeakers") },
                  { icon: Languages, label: t("home.trustChipLanguage") },
                  { icon: Shield, label: t("home.trustChipPrivacy") },
                ].map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <Icon aria-hidden="true" className="w-3.5 h-3.5 text-primary" />
                    {label}
                  </span>
                ))}
              </div>

              {/* CTAs */}
              <div className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3 md:max-w-[19.5rem] lg:max-w-none">
                <Button
                  asChild
                  size="lg"
                  className="h-12 px-7 text-base font-medium rounded-lg shadow-sm hover:shadow-md transition-shadow w-full"
                >
                  <Link to={heroPrimaryHref}>
                    {t("home.ctaPrimary")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 px-7 text-base font-medium rounded-lg w-full"
                >
                  <Link to="/pricing">{t("home.ctaPricingDetailed")}</Link>
                </Button>
              </div>
            </div>

            {/* Right: product mock */}
            <div className="md:col-span-7">
              <HeroProductMock />
            </div>
          </div>
        </div>
      </section>

      {/* 2 — Outcome showcase */}
      <HomeOutcomeGrid />

      {/* 3 — Beyond the transcript (bento) */}
      <HomeBeyondGrid />

      {/* 4 — How it works (typographic card-lets) */}
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
          {/* Desktop dashed connector — through numerals */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute left-[16%] right-[16%] top-1/2 -translate-y-1/2 border-t border-dashed border-border"
          />
          <div className="grid md:grid-cols-3 gap-6 md:gap-8 relative">
            {steps.map(({ step, icon: Icon, title, desc }) => (
              <div
                key={step}
                className="relative rounded-2xl border border-border/60 bg-card p-5 sm:p-6 flex items-start gap-4"
              >
                <div
                  aria-hidden="true"
                  className="font-serif italic text-[2.75rem] leading-none text-primary/35 shrink-0"
                >
                  {step}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon aria-hidden="true" className="w-4 h-4 text-primary" />
                    <h3 className="text-h3">{title}</h3>
                  </div>
                  <p className="text-[13px] leading-[1.5] text-muted-foreground leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5 — Privacy & trust (full-bleed inverted band) */}
      <section
        ref={privacy.ref}
        className="bg-foreground text-background dark:bg-muted/40 dark:text-foreground"
      >
        <div className="container mx-auto px-4 py-16 sm:py-20">
          <div
            className={`max-w-4xl mx-auto text-center transition-all duration-700 ${
              privacy.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <p className="font-serif italic text-caption text-primary mb-3 dark:text-primary">
              {t("home.privacyEyebrowNew")}
            </p>
            <h2 className="text-h1 sm:text-[2.25rem] mb-4">{t("home.privacyTitle")}</h2>
            <p className="font-serif text-body sm:text-lg text-background/80 dark:text-muted-foreground max-w-[60ch] mx-auto leading-relaxed mb-8">
              {t("home.privacyBody")}
            </p>
            <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {[
                { icon: Trash2, label: t("home.privacyBullet1") },
                { icon: Globe, label: t("home.privacyBullet2") },
                { icon: Shield, label: t("home.privacyBullet3") },
              ].map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-background/20 dark:border-border bg-background/5 dark:bg-card/40 px-3.5 py-2 text-caption"
                >
                  <Icon aria-hidden="true" className="w-3.5 h-3.5 text-primary" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 6 — Pricing teaser strip */}
      <PricingTeaserStrip />

      {/* 7 — Mini FAQ (with closing CTA) */}
      <HomeMiniFAQ />
    </div>
  );
}
