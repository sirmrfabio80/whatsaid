import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Shield, Mail } from "lucide-react";
import logoImg from "@/assets/logo.webp";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border">
      <div className="container mx-auto px-5 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={logoImg} alt="WhatSaid" className="w-7 h-7 rounded-lg" />
              <span className="font-heading font-semibold text-sm">WhatSaid</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
              {t("footer.desc")}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-heading font-semibold text-sm mb-3">{t("footer.product")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/convert" className="hover:text-foreground transition-colors">{t("footer.convertAudio")}</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground transition-colors">{t("nav.pricing")}</Link></li>
              <li><Link to="/login" className="hover:text-foreground transition-colors">{t("common.signIn")}</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-heading font-semibold text-sm mb-3">{t("footer.legal")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/terms" className="hover:text-foreground transition-colors">{t("footer.terms")}</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground transition-colors">{t("footer.privacy")}</Link></li>
              <li><Link to="/refund-policy" className="hover:text-foreground transition-colors">{t("footer.refundPolicy")}</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-heading font-semibold text-sm mb-3">{t("footer.support")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/help" className="hover:text-foreground transition-colors">
                  {t("footer.helpAndFaq")}
                </Link>
              </li>
              <li>
                <a href="mailto:support@whatsaid.app" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                  <Mail className="w-3.5 h-3.5" />
                  support@whatsaid.app
                </a>
              </li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              {t("footer.operator")}
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3 h-3" />
            <span>{t("footer.audioDeleted")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
