// In-app diagnostics for chunk-load failures.
// Persists a small ring buffer of failed dynamic-import events to sessionStorage
// so the Admin → Diagnostics tab can show exactly what failed and where.

const FAILURES_KEY = "__ws_chunk_failures";
const LAST_ACTION_KEY = "__ws_last_user_action";
const MAX_ENTRIES = 50;
const EVENT_NAME = "ws:chunk-failure";

export type ChunkFailure = {
  id: string;
  ts: number;
  route: string;
  url: string | null;
  message: string;
  name: string;
  source: "error" | "unhandledrejection" | "boundary";
  userAction: string | null;
  userAgent: string;
};

export type UserAction = {
  ts: number;
  description: string;
};

function safeSession(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function extractUrl(value: unknown, evt?: Event): string | null {
  // ErrorEvent on <script>/<link> exposes .target.src or .filename
  if (evt && "target" in evt) {
    const t = (evt as ErrorEvent).target as { src?: string; href?: string } | null;
    if (t?.src) return t.src;
    if (t?.href) return t.href;
  }
  if (evt && (evt as ErrorEvent).filename) return (evt as ErrorEvent).filename;

  const msg =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "";
  const m = msg.match(/https?:\/\/[^\s'")]+/);
  return m ? m[0] : null;
}

export function recordUserAction(description: string) {
  const store = safeSession();
  if (!store) return;
  try {
    const payload: UserAction = { ts: Date.now(), description: description.slice(0, 200) };
    store.setItem(LAST_ACTION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function getLastUserAction(): UserAction | null {
  const store = safeSession();
  if (!store) return null;
  try {
    const raw = store.getItem(LAST_ACTION_KEY);
    return raw ? (JSON.parse(raw) as UserAction) : null;
  } catch {
    return null;
  }
}

export function recordChunkFailure(input: {
  value: unknown;
  source: ChunkFailure["source"];
  evt?: Event;
}): void {
  if (typeof window === "undefined") return;
  const store = safeSession();
  if (!store) return;

  const value = input.value;
  const name =
    value instanceof Error
      ? value.name
      : typeof value === "object" && value !== null && "name" in value
        ? String((value as { name?: unknown }).name ?? "Error")
        : "Error";
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : typeof value === "object" && value !== null && "message" in value
          ? String((value as { message?: unknown }).message ?? "")
          : String(value);

  const lastAction = getLastUserAction();
  const entry: ChunkFailure = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    route: window.location.pathname + window.location.search,
    url: extractUrl(value, input.evt),
    message: message.slice(0, 500),
    name,
    source: input.source,
    userAction: lastAction?.description ?? null,
    userAgent: navigator.userAgent,
  };

  try {
    const existing = getChunkFailures();
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    store.setItem(FAILURES_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* ignore quota errors */
  }
}

export function getChunkFailures(): ChunkFailure[] {
  const store = safeSession();
  if (!store) return [];
  try {
    const raw = store.getItem(FAILURES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChunkFailure[]) : [];
  } catch {
    return [];
  }
}

export function clearChunkFailures(): void {
  const store = safeSession();
  if (!store) return;
  store.removeItem(FAILURES_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function subscribeChunkFailures(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/**
 * Install a global click listener that records a short description of the last
 * user-initiated action (label, href, role, route). Used to attribute chunk
 * failures to the click that triggered the lazy import.
 */
export function installUserActionTracker() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __wsActionTrackerInstalled?: boolean }).__wsActionTrackerInstalled) {
    return;
  }
  (window as unknown as { __wsActionTrackerInstalled?: boolean }).__wsActionTrackerInstalled = true;

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute("aria-label");
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const href = (el as HTMLAnchorElement).href;
    const role = el.getAttribute("role");
    const parts = [tag];
    if (role) parts.push(`role=${role}`);
    if (aria) parts.push(`aria="${aria}"`);
    else if (text) parts.push(`"${text}"`);
    if (href) parts.push(`→ ${href}`);
    return parts.join(" ");
  };

  window.addEventListener(
    "click",
    (e) => {
      const target = e.target as Element | null;
      if (!target) return;
      const interactive = target.closest("a, button, [role='button'], [role='link']");
      if (!interactive) return;
      recordUserAction(`click ${describe(interactive)} @ ${location.pathname}`);
    },
    { capture: true },
  );
}
