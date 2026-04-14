import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { CanonicalExportData } from "@/lib/export-types";

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  read: boolean;
  resource_type: string | null;
  resource_id: string | null;
  resource_url: string | null;
  async_job_id: string | null;
  created_at: string;
}

interface NotificationsContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  startPdfExport: (data: CanonicalExportData) => void;
  downloadExport: (storagePath: string, filename?: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  markRead: async () => {},
  markAllRead: async () => {},
  deleteNotification: async () => {},
  clearAllNotifications: async () => {},
  startPdfExport: () => {},
  downloadExport: async () => {},
});

export const useNotifications = () => useContext(NotificationsContext);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  // Track active PDF exports to prevent duplicate toasts on unmount/remount
  const activePdfExports = useRef<Set<string>>(new Set());

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data as AppNotification[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
  }, [user]);

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  const clearAllNotifications = useCallback(async () => {
    if (!user) return;
    setNotifications([]);
    await supabase.from("notifications").delete().eq("user_id", user.id);
  }, [user]);

  /** Generate a fresh signed URL for a storage path and trigger download */
  const downloadExport = useCallback(async (storagePath: string, filename?: string) => {
    const { data, error } = await supabase.storage
      .from("exports")
      .createSignedUrl(storagePath, 300);
    if (error || !data?.signedUrl) {
      toast.error(t("notifications.downloadFailed"));
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = filename || storagePath.split("/").pop() || "export.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [t]);

  /** Start an async PDF export — runs in the App shell context so it survives navigation */
  const startPdfExport = useCallback(
    (data: CanonicalExportData) => {
      if (!user) return;

      const exportId = crypto.randomUUID();
      if (activePdfExports.current.has(exportId)) return;
      activePdfExports.current.add(exportId);

      toast.info(t("notifications.pdfExportStarted"));

      // Fire-and-forget — runs even if the originating component unmounts
      (async () => {
        let asyncJobId: string | null = null;
        try {
          // 1. Create async_jobs row
          const { data: jobRow, error: insertErr } = await supabase
            .from("async_jobs")
            .insert({
              user_id: user.id,
              job_type: "pdf_export",
              status: "processing",
              title: data.title,
            })
            .select("id")
            .single();

          if (insertErr || !jobRow) throw new Error("Could not create export job");
          asyncJobId = jobRow.id;

          // 2. Generate PDF blob (client-side)
          const { generatePdfBlob } = await import("@/lib/export-pdf");
          const blob = await generatePdfBlob(data);

          // 3. Upload to exports bucket
          const storagePath = `${user.id}/${asyncJobId}.pdf`;
          const { error: uploadErr } = await supabase.storage
            .from("exports")
            .upload(storagePath, blob, {
              contentType: "application/pdf",
              upsert: false,
            });

          if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

          // 4. Update async_jobs to completed
          await supabase
            .from("async_jobs")
            .update({
              status: "completed",
              resource_type: "file",
              resource_url: storagePath,
              completed_at: new Date().toISOString(),
            })
            .eq("id", asyncJobId);

          // 5. Create notification with stable storage path
          await supabase.from("notifications").insert({
            user_id: user.id,
            type: "pdf_ready",
            title: data.title,
            description: t("notifications.pdfReady"),
            status: "success",
            resource_type: "file",
            resource_url: storagePath,
            async_job_id: asyncJobId,
          });

          // 6. Auto-download for convenience
          await downloadExport(storagePath, `${data.title}.pdf`);
        } catch (err) {
          console.error("[PDF export] Error:", err);
          const errorMsg = err instanceof Error ? err.message : "Export failed";

          // Mark async_job as failed if it was created
          if (asyncJobId) {
            await supabase
              .from("async_jobs")
              .update({
                status: "failed",
                error_message: errorMsg,
                completed_at: new Date().toISOString(),
              })
              .eq("id", asyncJobId);
          }

          // Create failure notification
          await supabase.from("notifications").insert({
            user_id: user!.id,
            type: "job_failed",
            title: data.title,
            description: t("notifications.pdfExportFailed"),
            status: "error",
            async_job_id: asyncJobId,
          });

          toast.error(t("notifications.pdfExportFailed"));
        } finally {
          activePdfExports.current.delete(exportId);
        }
      })();
    },
    [user, t, downloadExport]
  );

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, markRead, markAllRead, deleteNotification, clearAllNotifications, startPdfExport, downloadExport }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
