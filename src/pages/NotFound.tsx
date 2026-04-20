import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "@/hooks/use-page-meta";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  usePageMeta({
    title: "Page not found — WhatSaid",
    noindex: true,
  });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-display">{t("notFound.title")}</h1>
        <p className="mb-4 text-h2 text-muted-foreground">{t("notFound.message")}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-5 text-body-sm">
          <a href="/" className="text-primary underline hover:text-primary/90">
            {t("notFound.backHome")}
          </a>
          <a href="/help" className="text-primary underline hover:text-primary/90">
            {t("nav.help")}
          </a>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
