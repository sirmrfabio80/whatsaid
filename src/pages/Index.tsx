import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";

import {
  Sparkles, FileText, Users, ArrowRight, Shield, Clock,
  Upload, Cpu, Download, Globe, MessageSquareText
} from "lucide-react";
import logoImg from "@/assets/logo.webp";

export default function Index() {
  const { user, creditBalance } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const howItWorks = useScrollReveal();
  const capabilities = useScrollReveal();
  const pricing = useScrollReveal();
  const trust = useScrollReveal();

  const steps = [
    { step: "1", icon: Upload, title: t("home.stepUploadTitle"), desc: t("home.stepUploadDesc") },
    { step: "2", icon: Cpu, title: t("home.stepProcessTitle"), desc: t("home.stepProcessDesc") },
    { step: "3", icon: Download, title: t("home.stepDownloadTitle"), desc: t("home.stepDownloadDesc") },
  ];

  const caps = [
    { icon: Users, title: t("home.capSpeakerTitle"), desc: t("home.capSpeakerDesc") },
    { icon: FileText, title: t("home.capOutputsTitle"), desc: t("home.capOutputsDesc") },
    { icon: Globe, title: t("home.capLanguagesTitle"), desc: t("home.capLanguagesDesc") },
    { icon: Shield, title: t("home.capPrivacyTitle"), desc: t("home.capPrivacyDesc") },
    { icon: Clock, title: t("home.capSpeedTitle"), desc: t("home.capSpeedDesc") },
    { icon: MessageSquareText, title: t("home.capPromptsTitle"), desc: t("home.capPromptsDesc") },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 py-20 sm:py-32 relative">
          <div className="max-w-3xl mx-auto text-center animate-stagger">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium mb-6 animate-page-enter">
              <Sparkles className="w-3.5 h-3.5" />
              {t("home.tagline")}
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1] animate-page-enter">
              {t("home.heroTitle")}{" "}
              <span className="text-primary">{t("home.heroTitleHighlight")}</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed animate-page-enter">
              {t("home.heroDesc")}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-page-enter">
              <Button size="lg" className="h-12 px-8 text-base font-medium rounded-lg" onClick={() => navigate("/convert")}>
                {t("home.ctaPrimary")}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base rounded-lg" onClick={() => navigate("/pricing")}>
                {t("home.ctaPricing")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-muted/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <span>{t("home.statsLanguages")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span>{t("home.statsSpeakers")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>{t("home.statsPrivacy")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section ref={howItWorks.ref} className="container mx-auto px-4 py-16 sm:py-24">
        <div className={`text-center mb-12 transition-all duration-700 ${howItWorks.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">{t("home.howItWorksTitle")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{t("home.howItWorksDesc")}</p>
        </div>
        <div className={`grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto transition-all duration-700 delay-200 ${howItWorks.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          {steps.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div className="text-xs font-medium text-primary mb-1">{t("home.step", { number: step })}</div>
              <h3 className="font-heading font-semibold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section ref={capabilities.ref} className="bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 py-16 sm:py-24">
          <div className={`text-center mb-12 transition-all duration-700 ${capabilities.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">{t("home.capabilitiesTitle")}</h2>
            <p className="text-muted-foreground max-w-md mx-auto">{t("home.capabilitiesDesc")}</p>
          </div>
          <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto transition-all duration-700 delay-200 ${capabilities.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {caps.map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="rounded-xl border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all bg-card">
                <CardContent className="p-5 sm:p-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-heading font-semibold text-base mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section ref={pricing.ref} className="container mx-auto px-4 py-16 sm:py-24">
        <div className={`text-center mb-8 transition-all duration-700 ${pricing.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">{t("home.pricingCtaTitle")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">{t("home.pricingCtaDesc")}</p>
          <Button size="lg" className="h-12 px-8 text-base font-medium rounded-lg" onClick={() => navigate("/pricing")}>
            {t("nav.pricing")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Trust strip */}
      <section ref={trust.ref} className="border-t border-border bg-muted/30">
        <div className={`container mx-auto px-4 py-8 transition-all duration-700 ${trust.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="flex items-start sm:items-center justify-center gap-3 text-sm text-muted-foreground px-2 sm:px-0">
            <Shield className="w-5 h-5 sm:w-4 sm:h-4 text-primary shrink-0 mt-0.5 sm:mt-0" />
            <span>{t("home.trustStrip")}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
