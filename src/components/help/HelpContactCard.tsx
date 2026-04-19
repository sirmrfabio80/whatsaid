import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Public support email confirmed in src/components/Footer.tsx,
// src/i18n/locales/en.json (privacy, terms, refund), and used across legal pages.
const SUPPORT_EMAIL = "support@whatsaid.app";

export default function HelpContactCard() {
  const { t } = useTranslation();

  return (
    <section id="contact" className="container mx-auto px-5 sm:px-6 py-10 scroll-mt-24">
      <Card className="rounded-2xl border-border bg-card shadow-sm max-w-2xl mx-auto">
        <CardContent className="p-6 sm:p-8 text-center">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-5 h-5 text-primary" aria-hidden />
          </div>
          <h2 className="text-h2 sm:text-[1.25rem] mb-2">
            {t("help.contact.title")}
          </h2>
          <p className="text-secondary text-muted-foreground leading-relaxed mb-5 max-w-md mx-auto">
            {t("help.contact.body")}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild size="sm" className="rounded-lg">
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg">
              <Link to="/settings">{t("help.contact.accountIssue")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
