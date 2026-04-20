import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationsContext";
import NotificationItem from "@/components/NotificationItem";
import { EmptyState } from "@/components/ui/empty-state";
import { clearTabBadge } from "@/lib/tab-title-badge";

export default function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead, clearAllNotifications } = useNotifications();

  // Clear the tab title badge — the user is looking at the alerts directly
  useEffect(() => {
    clearTabBadge();
  }, []);

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const revealStyle = (delayMs: number): React.CSSProperties => ({
    animationDelay: `${delayMs}ms`,
    animationFillMode: "both",
  });
  const REVEAL_CLASS = "motion-safe:animate-fade-in motion-reduce:animate-none";

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div
        className={`sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border ${REVEAL_CLASS}`}
        style={revealStyle(0)}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-lg w-10 h-10"
              onClick={goBack}
              aria-label={t("common.back")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-h2">{t("notifications.title")}</h1>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-caption h-9 px-3 text-muted-foreground"
                onClick={() => markAllRead()}
              >
                {t("notifications.markAllRead")}
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="w-9 h-9 text-muted-foreground hover:text-destructive"
                onClick={() => clearAllNotifications()}
                aria-label={t("notifications.clearAll")}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {notifications.length === 0 ? (
        <div className={REVEAL_CLASS} style={revealStyle(80)}>
          <EmptyState icon={Bell} title={t("notifications.empty")} variant="plain" className="py-20" />
        </div>
      ) : (
        <div className={`p-2 space-y-1 ${REVEAL_CLASS}`} style={revealStyle(80)}>
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClose={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
