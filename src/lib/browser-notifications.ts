/**
 * Lightweight in-tab Web Notification helper.
 *
 * Strategy:
 * - We use the standard Notification API only (no service worker, no Web Push).
 * - Notifications fire while the WhatSaid tab is alive in the browser, even if
 *   it is in a background tab or behind another window. They will NOT fire when
 *   the browser is fully closed.
 * - We never auto-prompt: callers explicitly request permission at meaningful
 *   moments (e.g. the user starts a transcription).
 * - We persist the user's permission decision intent in localStorage so we
 *   don't badger them again in the same browser if they dismissed the prompt.
 */

const ASK_FLAG_KEY = "ws.notif.asked";

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

export function hasAskedThisSession(): boolean {
  try {
    return localStorage.getItem(ASK_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASK_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Request permission once. Safe to call repeatedly:
 * - Returns immediately if unsupported, already granted, or already denied.
 * - Marks the asked flag so we don't keep re-prompting the same user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") {
    markAsked();
    return "denied";
  }
  if (hasAskedThisSession() && Notification.permission === "default") {
    // User dismissed silently before — don't keep asking until they explicitly retry
    return "default";
  }
  try {
    const result = await Notification.requestPermission();
    markAsked();
    return result as NotificationPermissionState;
  } catch {
    markAsked();
    return "default";
  }
}

interface ShowOptions {
  body?: string;
  tag?: string;
  /** URL to navigate to when the notification is clicked (relative or absolute). */
  url?: string;
  /** If true, skip showing when the tab is currently visible+focused. Default: true. */
  onlyWhenHidden?: boolean;
}

/**
 * Show a system notification. No-op if permission isn't granted or if the tab
 * is already visible (unless onlyWhenHidden=false).
 */
export function showBrowserNotification(title: string, options: ShowOptions = {}): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== "granted") return null;

  const onlyWhenHidden = options.onlyWhenHidden ?? true;
  if (onlyWhenHidden) {
    const visible = document.visibilityState === "visible" && document.hasFocus();
    if (visible) return null;
  }

  try {
    const n = new Notification(title, {
      body: options.body,
      tag: options.tag,
      icon: "/apple-touch-icon.png",
      badge: "/favicon.png",
    });
    if (options.url) {
      n.onclick = () => {
        try {
          window.focus();
          if (options.url) {
            window.location.href = options.url;
          }
        } finally {
          n.close();
        }
      };
    }
    return n;
  } catch {
    return null;
  }
}
