import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { CanonicalExportData } from "@/lib/export-types";
import { sanitizeFileBaseName } from "@/lib/export-filename";
import { sanitizeStorageFilename } from "@/lib/sanitize-filename";
import { showBrowserNotification } from "@/lib/browser-notifications";
import { playCompletionChime } from "@/lib/notification-sound";
import { incrementTabBadge } from "@/lib/tab-title-badge";

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
  pulseTrigger: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  startPdfExport: (data: CanonicalExportData, sourceJobId?: string) => void;
  downloadExport: (storagePath: string, filename?: string) => Promise<void>;
  openExport: (storagePath: string) => Promise<boolean>;
}

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  unreadCount: 0,
  loading: true,
  pulseTrigger: 0,
  markRead: async () => {},
  markAllRead: async () => {},
  deleteNotification: async () => {},
  clearAllNotifications: async () => {},
  startPdfExport: () => {},
  downloadExport: async () => {},
  openExport: async () => false,
});

export const useNotifications = () => useContext(NotificationsContext);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const activePdfExports = useRef<Set<string>>(new Set());
  // Ref to hold latest notifications for rollback without stale closures
  const notificationsRef = useRef<AppNotification[]>([]);
  notificationsRef.current = notifications;

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

  // Realtime subscription — explicit INSERT, UPDATE, DELETE
  useEffect(() => {
    if (!user) return;
    const filter = `user_id=eq.${user.id}`;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter },
        (payload) => {
          const newNotif = payload.new as AppNotification;
          setNotifications((prev) => {
            // Dedupe — don't add if already present
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev].slice(0, 50);
          });
          // Pulse the bell when a transcription completes
          if (newNotif.type === "transcript_ready") {
            setPulseTrigger((p) => p + 1);

            // Fire a system notification only if the tab isn't currently visible.
            // Permission is requested separately on the Convert page.
            const url = newNotif.resource_id
              ? `${window.location.origin}/job/${newNotif.resource_id}`
              : window.location.origin;
            showBrowserNotification(
              t("notifications.browserPushTitle", { defaultValue: "Transcription ready" }),
              {
                body: newNotif.title || t("notifications.browserPushBody", { defaultValue: "Your transcript is ready to view." }),
                tag: `transcript-${newNotif.resource_id ?? newNotif.id}`,
                url,
              },
            );
            // Subtle completion chime (respects user's mute preference)
            playCompletionChime();
            // Tab title badge — only shows while the tab is hidden, auto-clears on focus
            incrementTabBadge();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter },
        (payload) => {
          const updated = payload.new as AppNotification;
          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === updated.id);
            if (exists) {
              return prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n));
            }
            // Not in local state — add it (e.g. arrived while list was stale)
            return [updated, ...prev].slice(0, 50);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) {
            setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // --- Optimistic actions with re-fetch on failure ---

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", id);
    if (error) {
      // Granular: revert only this notification's read state
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n))
      );
      toast.error(t("notifications.actionFailed"));
    }
  }, [t]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    // Track which IDs were unread before so we can revert only those
    const unreadIds = new Set(
      notificationsRef.current.filter((n) => !n.read).map((n) => n.id)
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    if (error) {
      // Revert only the ones we optimistically changed
      setNotifications((prev) =>
        prev.map((n) => (unreadIds.has(n.id) ? { ...n, read: false } : n))
      );
      toast.error(t("notifications.actionFailed"));
    }
  }, [user, t]);

  const deleteNotification = useCallback(async (id: string) => {
    // Capture the item for reinsertion on failure
    const deleted = notificationsRef.current.find((n) => n.id === id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      // Re-insert at original position based on created_at
      if (deleted) {
        setNotifications((prev) => {
          const merged = [...prev, deleted].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          return merged.slice(0, 50);
        });
      }
      toast.error(t("notifications.actionFailed"));
    }
  }, [t]);

  const clearAllNotifications = useCallback(async () => {
    if (!user) return;
    setNotifications([]);
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
    if (error) {
      // Full re-fetch — safest recovery for bulk delete failure
      toast.error(t("notifications.actionFailed"));
      await loadNotifications();
    }
  }, [user, t, loadNotifications]);

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

  /** Generate a fresh signed URL and open the PDF in a new browser tab */
  const openExport = useCallback(async (storagePath: string): Promise<boolean> => {
    const { data, error } = await supabase.storage
      .from("exports")
      .createSignedUrl(storagePath, 600);
    if (error || !data?.signedUrl) {
      toast.error(t("notifications.downloadFailed"));
      return false;
    }
    const win = window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    return !!win;
  }, [t]);

  /** Start an async PDF export — runs in the App shell context so it survives navigation */
  const startPdfExport = useCallback(
    (data: CanonicalExportData, sourceJobId?: string) => {
      if (!user) return;

      // Dedupe: prefer sourceJobId, fallback to deterministic hash of payload
      let exportKey: string;
      if (sourceJobId) {
        exportKey = `pdf:${sourceJobId}`;
      } else {
        const parts = [
          data.title,
          data.createdAt,
          data.language ?? "",
          data.duration ?? "",
          String(data.transcript?.length ?? 0),
          String(data.summary?.length ?? 0),
          String(data.questions?.length ?? 0),
          data.transcript?.slice(0, 64) ?? "",
        ];
        exportKey = `pdf:fallback:${parts.join("|")}`;
      }

      if (activePdfExports.current.has(exportKey)) {
        toast.info(t("notifications.exportAlreadyRunning"));
        return;
      }
      activePdfExports.current.add(exportKey);

      // Pre-open tab synchronously from user gesture — browsers allow this
      const pdfTab = window.open("", "_blank");
      if (pdfTab) {
        pdfTab.document.write(`<!DOCTYPE html><html><head><title>WhatSaid</title>
<style>body{font-family:Inter,sans-serif;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;background:#0F172A;color:#e2e8f0;}
.c{text-align:center}.s{animation:spin 1s linear infinite;width:24px;height:24px;
border:3px solid #334155;border-top-color:#818cf8;border-radius:50%;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><div class="c"><div class="s"></div><div>Preparing PDF\u2026</div></div></body></html>`);
        pdfTab.document.close();
      }

      toast.info(t("notifications.pdfExportStarted"));

      // Fire-and-forget — runs even if the originating component unmounts
      (async () => {
        let asyncJobId: string | null = null;
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        try {
          // 1. Create async_jobs row
          const { data: jobRow, error: insertErr } = await supabase
            .from("async_jobs")
            .insert({
              user_id: user.id,
              job_type: "pdf_export",
              status: "processing",
              title: data.title,
              resource_id: sourceJobId ?? null,
            })
            .select("id")
            .single();

          if (insertErr || !jobRow) throw new Error("Could not create export job");
          asyncJobId = jobRow.id;

          // Start heartbeat — bump updated_at every 30s so cleanup-stale-jobs doesn't kill us
          heartbeat = setInterval(async () => {
            await supabase
              .from("async_jobs")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", asyncJobId);
          }, 30_000);

          // 2. Generate PDF blob (client-side)
          const { generatePdfBlob } = await import("@/lib/export-pdf");
          const blob = await generatePdfBlob(data);

          // 3. Upload to exports bucket — sanitize for Supabase Storage key constraints
          // (sanitizeFileBaseName preserves the human title for UI; storage needs ASCII-safe)
          const pdfFileName = sanitizeStorageFilename(`${sanitizeFileBaseName(data.title)}.pdf`);
          const storagePath = `${user.id}/${asyncJobId}/${pdfFileName}`;
          const { error: uploadErr } = await supabase.storage
            .from("exports")
            .upload(storagePath, blob, {
              contentType: "application/pdf",
              upsert: false,
            });

          if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

          // 4. Stop heartbeat & update async_jobs to completed
          if (heartbeat) clearInterval(heartbeat);
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
            resource_id: sourceJobId ?? null,
            async_job_id: asyncJobId,
          });

          // 6. Navigate pre-opened tab to the signed PDF URL
          if (pdfTab && !pdfTab.closed) {
            const { data: urlData } = await supabase.storage
              .from("exports")
              .createSignedUrl(storagePath, 600);
            if (urlData?.signedUrl) {
              pdfTab.location.href = urlData.signedUrl;
            }
          } else {
            toast.info(t("notifications.pdfReadyCheckNotifications"));
          }
        } catch (err) {
          if (heartbeat) clearInterval(heartbeat);
          console.error("[PDF export] Error:", err);
          const errorMsg = err instanceof Error ? err.message : "Export failed";

          // Show generic safe error in pre-opened tab
          if (pdfTab && !pdfTab.closed) {
            pdfTab.document.open();
            pdfTab.document.write(`<!DOCTYPE html><html><head><title>WhatSaid</title>
<style>body{font-family:Inter,sans-serif;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;background:#0F172A;color:#e2e8f0;}
.c{text-align:center;max-width:400px}h2{color:#f87171}</style></head>
<body><div class="c"><h2>Export failed</h2>
<p>Something went wrong while preparing your PDF.</p>
<p style="margin-top:12px;color:#94a3b8">Check your notifications for details.</p>
</div></body></html>`);
            pdfTab.document.close();
          }

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
            type: "pdf_export_failed",
            title: data.title,
            description: t("notifications.pdfExportFailed"),
            status: "error",
            resource_id: sourceJobId ?? null,
            async_job_id: asyncJobId,
          });

          toast.error(t("notifications.pdfExportFailed"));
        } finally {
          activePdfExports.current.delete(exportKey);
        }
      })();
    },
    [user, t]
  );

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, pulseTrigger, markRead, markAllRead, deleteNotification, clearAllNotifications, startPdfExport, downloadExport, openExport }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
