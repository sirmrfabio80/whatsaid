import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Shield, Upload, CreditCard, FileLock2 } from "lucide-react";
import HelpHero from "@/components/help/HelpHero";
import HelpTOC, { type TocItem } from "@/components/help/HelpTOC";
import HelpWorkflow from "@/components/help/HelpWorkflow";
import HelpFeatureGrid from "@/components/help/HelpFeatureGrid";
import HelpFAQ from "@/components/help/HelpFAQ";
import HelpTroubleshooting from "@/components/help/HelpTroubleshooting";
import HelpContactCard from "@/components/help/HelpContactCard";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePageMeta } from "@/hooks/use-page-meta";

export default function Help() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const debouncedFilter = useDebouncedValue(filter, 150);

  const tocItems: TocItem[] = [
    { id: "workflow", label: t("help.toc.workflow") },
    { id: "features", label: t("help.toc.features") },
    { id: "faq", label: t("help.toc.faq") },
    { id: "troubleshooting", label: t("help.toc.troubleshooting") },
    { id: "privacy", label: t("help.toc.privacy") },
    { id: "contact", label: t("help.toc.contact") },
  ];

  usePageMeta({
    title: t("help.metaTitle"),
    description: t("help.metaDescription", {
      defaultValue:
        "Help & FAQ for WhatSaid. Learn how to upload audio, transcribe, summarise, and ask questions about your recordings.",
    }),
    ogImage: "https://whatsaid.app/og-help.png",
    canonical: "https://whatsaid.app/help",
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <HelpHero query={filter} onQueryChange={setFilter} />

      {/* Quick links chips */}
      <section className="container mx-auto px-5 sm:px-6 pb-2">
        <ul className="flex flex-wrap gap-2 justify-center">
          <li>
            <Link to="/convert" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
              <Upload className="w-3.5 h-3.5 text-primary" />
              {t("help.quick.upload")}
            </Link>
          </li>
          <li>
            <Link to="/pricing" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
              <CreditCard className="w-3.5 h-3.5 text-primary" />
              {t("help.quick.pricing")}
            </Link>
          </li>
          <li>
            <Link to="/privacy" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
              <FileLock2 className="w-3.5 h-3.5 text-primary" />
              {t("help.quick.privacy")}
            </Link>
          </li>
          <li>
            <a href="#contact" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
              {t("help.quick.contact")}
            </a>
          </li>
        </ul>
      </section>

      {/* Main two-column area on lg+ */}
      <div className="container mx-auto px-5 sm:px-6 py-2 lg:py-6">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-10 max-w-6xl mx-auto">
          <aside className="lg:pt-10">
            <HelpTOC items={tocItems} />
          </aside>
          <div className="min-w-0 -mx-5 sm:-mx-6 lg:mx-0">
            <HelpWorkflow />
            <HelpFeatureGrid filter={debouncedFilter} />
            <HelpFAQ filter={debouncedFilter} />
            <HelpTroubleshooting filter={debouncedFilter} />

            {/* Privacy at a glance */}
            <section id="privacy" className="container mx-auto px-5 sm:px-6 py-10 scroll-mt-24">
              <div className="rounded-2xl border border-border bg-muted/30 p-6 max-w-3xl mx-auto">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Shield className="w-4.5 h-4.5 text-primary" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-h2 mb-2">{t("help.privacy.title")}</h2>
                    <ul className="space-y-1.5 text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 mb-3">
                      <li>{t("help.privacy.b1")}</li>
                      <li>{t("help.privacy.b2")}</li>
                      <li>{t("help.privacy.b3")}</li>
                    </ul>
                    <Link to="/privacy" className="text-body-sm text-primary hover:underline">
                      {t("help.privacy.readMore")} →
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            <HelpContactCard />
          </div>
        </div>
      </div>
    </div>
  );
}
