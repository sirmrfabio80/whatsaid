import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, Info, FileText, Loader2 } from "lucide-react";
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
  const { markRead } = useNotifications();

  const handleClick = async () => {
    if (!notification.read) {
      await markRead(notification.id);
    }
    // Navigate to resource if available
    if (notification.resource_type === "job" && notification.resource_id) {
      navigate(`/job/${notification.resource_id}`);
      onClose();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left px-3 py-2.5 flex gap-2.5 items-start rounded-lg transition-colors hover:bg-muted/60",
        !notification.read && "bg-primary/5"
      )}
    >
      <div className="mt-0.5 shrink-0">
        {statusIcons[notification.status] ?? <FileText className="w-4 h-4 text-muted-foreground" />}
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
        <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(notification.created_at)}</p>
      </div>
      {!notification.read && (
        <div className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-primary" />
      )}
    </button>
  );
}
