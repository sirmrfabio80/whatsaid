import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/contexts/NotificationsContext";
import NotificationItem from "@/components/NotificationItem";

export default function Notifications() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead, clearAllNotifications } = useNotifications();

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border">
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
            <h1 className="text-lg font-semibold">{t("notifications.title")}</h1>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-9 px-3 text-muted-foreground"
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
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <Bell className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
        </div>
      ) : (
        <div className="p-2 space-y-1">
          {notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClose={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
