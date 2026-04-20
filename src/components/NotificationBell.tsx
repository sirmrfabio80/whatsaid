import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useIsMobile } from "@/hooks/use-mobile";
import NotificationItem from "@/components/NotificationItem";
import { EmptyState } from "@/components/ui/empty-state";
import { clearFaviconBadge } from "@/lib/favicon-badge";

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { notifications, unreadCount, markAllRead, clearAllNotifications, pulseTrigger } = useNotifications();
  const [open, setOpen] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initialPulseRef = useRef(pulseTrigger);

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

  // Trigger pulse animation when a transcription completes (skip the initial mount value)
  useEffect(() => {
    if (pulseTrigger === initialPulseRef.current) return;
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), 2400);
    return () => window.clearTimeout(timer);
  }, [pulseTrigger]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="rounded-lg relative w-8 h-8"
        onClick={() => {
          setPulsing(false);
          clearFaviconBadge();
          if (isMobile) {
            navigate("/notifications");
            return;
          }
          setOpen((o) => !o);
        }}
        aria-label={t("notifications.title")}
      >
        {pulsing && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-lg bg-primary/40 animate-pulse-ring motion-reduce:hidden"
          />
        )}
        <Bell
          className={`w-4 h-4 ${pulsing ? "text-primary motion-safe:animate-[pulse_0.9s_ease-in-out_2]" : ""}`}
        />
        {unreadCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-micro font-bold leading-none ${
              pulsing ? "motion-safe:animate-[pulse_0.9s_ease-in-out_2]" : ""
            }`}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {!isMobile && open && (
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
            <EmptyState
              icon={Bell}
              title={t("notifications.empty")}
              variant="plain"
              className="py-8"
            />
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
