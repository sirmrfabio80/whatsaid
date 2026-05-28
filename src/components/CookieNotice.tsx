/**
 * Informational PECR / UK GDPR cookie notice.
 *
 * - Renders as a bottom-right toast on ≥640 px and a bottom sheet on
 *   mobile (respects safe-area inset).
 * - Today we only set strictly-necessary and first-party functional
 *   storage, so this is an informational banner with a single dismiss
 *   action — not a consent gate. The day `requiresConsent()` flips to
 *   true (an analytics or marketing entry lands in the inventory) this
 *   component should be upgraded into a true consent dialog.
 * - Hidden on `/cookies`, `/privacy`, `/terms`, `/refund-policy` to avoid
 *   stacking on the legal pages.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pick, NOTICE_STRINGS } from "@/lib/cookie-notice-strings";
import { requiresConsent } from "@/lib/cookie-inventory";

const ACK_KEY = "ws.cookie_notice_ack_v1";

const HIDDEN_PATH_PREFIXES = [
  "/cookies",
  "/privacy",
  "/terms",
  "/refund-policy",
];

function readAck(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return true;
  }
}

function writeAck(): void {
  try {
    window.localStorage.setItem(ACK_KEY, "1");
  } catch {
    // ignore
  }
}

export default function CookieNotice() {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();
  const [acked, setAcked] = useState<boolean>(() => readAck());

  // Keyboard: Esc dismisses
  useEffect(() => {
    if (acked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleAck();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acked]);

  // If we ever ship analytics/marketing storage, the banner must become a
  // real consent dialog. Loud-fail in dev so it's caught immediately.
  if (requiresConsent() && import.meta.env.DEV) {
    console.warn(
      "[CookieNotice] inventory now contains consent-requiring entries; this component must be upgraded to a true consent dialog.",
    );
  }

  if (acked) return null;
  if (HIDDEN_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const lang = i18n.language;

  function handleAck() {
    writeAck();
    setAcked(true);
  }

  return (
    <div
      role="region"
      aria-label={pick(NOTICE_STRINGS.ariaRegion, lang)}
      className="fixed z-50 inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
      style={{
        paddingBottom: "max(0px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="rounded-2xl border border-border/70 bg-card/95 backdrop-blur-md shadow-lg p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-body-sm font-semibold text-foreground">
            {pick(NOTICE_STRINGS.title, lang)}
          </h2>
          <button
            type="button"
            onClick={handleAck}
            aria-label={pick(NOTICE_STRINGS.ack, lang)}
            className="-mt-1 -mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-caption text-muted-foreground leading-relaxed">
          {pick(NOTICE_STRINGS.body, lang)}
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button asChild variant="ghost" size="sm" className="h-9 rounded-lg">
            <Link to="/cookies">{pick(NOTICE_STRINGS.details, lang)}</Link>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleAck}
            className="h-9 min-w-[80px] rounded-lg"
          >
            {pick(NOTICE_STRINGS.ack, lang)}
          </Button>
        </div>
      </div>
    </div>
  );
}
