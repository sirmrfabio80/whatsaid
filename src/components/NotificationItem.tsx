import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Info, FileText, Loader2, X, RotateCw } from "lucide-react";
import { useNotifications, type AppNotification } from "@/contexts/NotificationsContext";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const statusIcons: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))]" />,
  error: <XCircle className="w-4 h-4 text-destructive" />,
  info: <Info className="w-4 h-4 text-[hsl(var(--info))]" />,
  in_progress: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
};

interface NotificationItemProps {
  notification: AppNotification;
  onClose: () => void;
}

export default function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { markRead, openExport, deleteNotification } = useNotifications();
  const [downloading, setDownloading] = useState(false);

  const isPdfExportFailed = notification.type === "pdf_export_failed" && notification.resource_id;

  const handleClick = async () => {
    if (!notification.read) {
      await markRead(notification.id);
    }

    // Handle file views (PDF exports) — open in new tab
    if (notification.resource_type === "file" && notification.resource_url) {
      setDownloading(true);
      try {
        await openExport(notification.resource_url);
      } finally {
        setDownloading(false);
      }
      onClose();
      return;
    }

    // Navigate to resource if available (transcript jobs)
    if (notification.resource_type === "job" && notification.resource_id) {
      navigate(`/job/${notification.resource_id}`);
      onClose();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (notification.resource_id) {
      navigate(`/job/${notification.resource_id}`);
      onClose();
    }
  };

  const isFile = notification.resource_type === "file" && notification.resource_url;

  return (
    <div className="group relative">
      <button
        onClick={handleClick}
        disabled={downloading}
        className={cn(
          "w-full text-left px-3 py-2.5 pr-14 md:pr-8 flex gap-2.5 items-start rounded-lg transition-colors hover:bg-muted/60",
          !notification.read && "bg-primary/5",
          downloading && "opacity-60"
        )}
      >
        <div className="mt-0.5 shrink-0">
          {downloading ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : (
            statusIcons[notification.status] ?? <FileText className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm leading-snug", !notification.read && "font-medium")}>
            {notification.title}
          </p>
          {notification.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {notification.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-muted-foreground">{timeAgo(notification.created_at)}</span>
            {isFile && !downloading && (
              <span className="text-[11px] text-primary flex items-center gap-0.5">
                <FileText className="w-3 h-3" /> View PDF
              </span>
            )}
            {isPdfExportFailed && (
              <button
                onClick={handleRetry}
                className="text-[11px] text-primary flex items-center gap-0.5 hover:underline"
              >
                <RotateCw className="w-3 h-3" /> {t("notifications.retry")}
              </button>
            )}
          </div>
        </div>
        {!notification.read && (
          <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-primary" />
        )}
      </button>
      {/* Delete button — always visible on mobile, hover on desktop */}
      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 p-2 md:p-1 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center rounded-md opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-muted text-muted-foreground hover:text-destructive"
        aria-label="Delete notification"
      >
        <X className="w-4 h-4 md:w-3 md:h-3" />
      </button>
    </div>
  );
}
