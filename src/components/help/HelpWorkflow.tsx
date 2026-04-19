import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import {
  Upload, FileText, Users, Sparkles, MessageSquareText, Tags, Download, History, Languages, ArrowRight,
} from "lucide-react";
import { workflow } from "@/content/help/workflow";
import { pickLocale } from "@/content/help/pickLocale";

const ICONS = {
  upload: Upload,
  fileText: FileText,
  users: Users,
  sparkles: Sparkles,
  messageSquareText: MessageSquareText,
  tags: Tags,
  download: Download,
  history: History,
  languages: Languages,
} as const;

export default function HelpWorkflow() {
  const { t, i18n } = useTranslation();

  return (
    <section id="workflow" className="container mx-auto px-5 sm:px-6 py-10 scroll-mt-24">
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-semibold mb-1">
          {t("help.workflow.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("help.workflow.lead")}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {workflow.map((step) => {
          const Icon = ICONS[step.icon];
          return (
            <Card key={step.id} className="rounded-2xl border-border bg-card shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5 text-primary" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base mb-1.5 leading-snug">
                      {pickLocale(step.title, i18n.language)}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {pickLocale(step.body, i18n.language)}
                    </p>
                    {step.cta && (
                      <Link
                        to={step.cta.href}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
                      >
                        {pickLocale(step.cta.label, i18n.language)}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
