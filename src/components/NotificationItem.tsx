import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Info, FileText, Loader2, Download, X } from "lucide-react";
import { useNotifications, type AppNotification } from "@/contexts/NotificationsContext";
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
  const { markRead, downloadExport, deleteNotification } = useNotifications();
  const [downloading, setDownloading] = useState(false);

  const handleClick = async () => {
    if (!notification.read) {
      await markRead(notification.id);
    }

    // Handle file downloads (PDF exports)
    if (notification.resource_type === "file" && notification.resource_url) {
      setDownloading(true);
      try {
        const filename = notification.title ? `${notification.title}.pdf` : undefined;
        await downloadExport(notification.resource_url, filename);
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

  const isFile = notification.resource_type === "file" && notification.resource_url;

  return (
    <div className="group relative">
      <button
        onClick={handleClick}
        disabled={downloading}
        className={cn(
          "w-full text-left px-3 py-2.5 pr-8 flex gap-2.5 items-start rounded-lg transition-colors hover:bg-muted/60",
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
                <Download className="w-3 h-3" /> Download
              </span>
            )}
          </div>
        </div>
        {!notification.read && (
          <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-primary" />
        )}
      </button>
      {/* Delete button — visible on hover */}
      <button
        onClick={handleDelete}
        className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted text-muted-foreground hover:text-destructive"
        aria-label="Delete notification"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
