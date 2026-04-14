import { useState, useRef, useEffect } from "react";
import { Bell, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/contexts/NotificationsContext";
import NotificationItem from "@/components/NotificationItem";

export default function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAllRead, clearAllNotifications } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-lg relative w-8 h-8"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("notifications.title")}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-w-[calc(100vw-2rem)] bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-sm font-semibold">{t("notifications.title")}</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-muted-foreground"
                  onClick={() => markAllRead()}
                >
                  {t("notifications.markAllRead")}
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => clearAllNotifications()}
                  aria-label={t("notifications.clearAll")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
            </div>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="p-1 space-y-0.5">
                {notifications.map((n) => (
                  <NotificationItem key={n.id} notification={n} onClose={() => setOpen(false)} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
