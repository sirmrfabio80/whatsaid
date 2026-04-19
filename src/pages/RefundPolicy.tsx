import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useJsonLd } from "@/hooks/use-json-ld";
import { buildBreadcrumbList } from "@/lib/breadcrumbs";

export default function RefundPolicy() {
  const { t } = useTranslation();

  usePageMeta({
    title: "Refund Policy — WhatSaid",
    description:
      "WhatSaid refund policy for credit purchases. Learn when refunds are available and how to request one.",
    canonical: "https://whatsaid.app/refund-policy",
    ogImage: "https://whatsaid.app/og-refund.png",
  });

  useJsonLd(
    "ld-breadcrumb-refund",
    buildBreadcrumbList([{ name: "Refund Policy", path: "/refund-policy" }]),
  );


  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground mb-6" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" />{t("common.backToHome")}</Link>
          </Button>

          <h1 className="text-h1 sm:text-[1.875rem] tracking-tight mb-2">{t("refund.title")}</h1>
          <p className="text-body-sm text-muted-foreground mb-8">{t("refund.lastUpdated", { date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) })}</p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-h2 mb-2">{t("refund.s1Title")}</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">{t("refund.s1Body")}</p>
            </section>
            <section>
              <h2 className="text-h2 mb-2">{t("refund.s2Title")}</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">{t("refund.s2Body")}</p>
            </section>
            <section>
              <h2 className="text-h2 mb-2">{t("refund.s3Title")}</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">{t("refund.s3Body")}</p>
            </section>
            <section>
              <h2 className="text-h2 mb-2">{t("refund.s4Title")}</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">{t("refund.s4Body")}</p>
            </section>
            <section>
              <h2 className="text-h2 mb-2">{t("refund.s5Title")}</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">{t("refund.s5Body")}</p>
            </section>
            <section>
              <h2 className="text-h2 mb-2">{t("refund.s6Title")}</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">{t("refund.s6Body")}</p>
            </section>
            <section>
              <h2 className="text-h2 mb-2">{t("refund.s7Title")}</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">{t("refund.s7Body")}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
