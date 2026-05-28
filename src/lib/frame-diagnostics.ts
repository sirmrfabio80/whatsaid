// Client-side diagnostics for framing + CSP violations.
//
// When the Lovable preview turns white, the usual culprits are:
//   1. A CSP directive (script-src, connect-src, style-src, frame-ancestors)
//      blocking a resource — this fires `securitypolicyviolation` on the
//      affected document.
//   2. The page being loaded outside the expected ancestor — useful to log
//      so we can see what origin actually embedded us.
//
// We persist a small ring buffer to sessionStorage and expose a subscription
// API consumed by the Admin → Security headers tab.

const KEY = "__ws_frame_diagnostics";
const EVENT_NAME = "ws:frame-diagnostic";
const MAX_ENTRIES = 50;

export type FrameDiagnosticKind = "csp-violation" | "framing-info" | "framing-warning";

export type FrameDiagnostic = {
  id: string;
  ts: number;
  kind: FrameDiagnosticKind;
  message: string;
  // CSP-specific
  directive?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  disposition?: "enforce" | "report";
  // Framing-specific
  topOrigin?: string | null;
  ancestorOrigins?: string[];
  referrer?: string;
  // Common
  documentUri?: string;
};

function safeSession(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function getFrameDiagnostics(): FrameDiagnostic[] {
  const store = safeSession();
  if (!store) return [];
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FrameDiagnostic[]) : [];
  } catch {
    return [];
  }
}

export function clearFrameDiagnostics(): void {
  const store = safeSession();
  if (!store) return;
  store.removeItem(KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

export function subscribeFrameDiagnostics(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

function record(entry: Omit<FrameDiagnostic, "id" | "ts">): void {
  const store = safeSession();
  if (!store) return;
  try {
    const full: FrameDiagnostic = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      ...entry,
    };
    const next = [full, ...getFrameDiagnostics()].slice(0, MAX_ENTRIES);
    store.setItem(KEY, JSON.stringify(next));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    }
  } catch {
    /* ignore quota */
  }
}

function safeAncestorOrigins(): string[] {
  try {
    const list = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (!list) return [];
    return Array.from({ length: list.length }, (_, i) => list.item(i) ?? "").filter(Boolean);
  } catch {
    return [];
  }
}

function safeTopOrigin(): string | null {
  try {
    // Cross-origin access throws; that's actually expected when embedded.
    return window.top && window.top !== window.self ? window.top.location.origin : null;
  } catch {
    return null;
  }
}

/**
 * Install global listeners for `securitypolicyviolation` and capture a
 * one-shot snapshot of the framing context (top window, ancestor origins,
 * referrer). Safe to call multiple times — guarded by a flag on window.
 */
export function installFrameDiagnostics(): void {
  if (typeof window === "undefined") return;
  type Flagged = { __wsFrameDiagInstalled?: boolean };
  const w = window as unknown as Flagged;
  if (w.__wsFrameDiagInstalled) return;
  w.__wsFrameDiagInstalled = true;

  // 1. CSP violations — both enforced and Report-Only directives fire here.
  document.addEventListener("securitypolicyviolation", (e) => {
    record({
      kind: "csp-violation",
      message: `CSP ${e.disposition}: ${e.violatedDirective} blocked ${e.blockedURI || "(inline)"}`,
      directive: e.violatedDirective,
      blockedUri: e.blockedURI || undefined,
      sourceFile: e.sourceFile || undefined,
      lineNumber: e.lineNumber || undefined,
      disposition: (e.disposition as FrameDiagnostic["disposition"]) ?? "enforce",
      documentUri: e.documentURI || location.href,
    });
  });

  // 2. Framing snapshot (one entry per page load).
  const isFramed = window.self !== window.top;
  const ancestors = safeAncestorOrigins();
  const topOrigin = safeTopOrigin();

  if (isFramed) {
    const knownLovableHost = ancestors.some((origin) =>
      /(^|\.)lovable\.(app|dev|project)/i.test(origin) || origin.includes("lovableproject.com"),
    );
    record({
      kind: knownLovableHost || ancestors.length === 0 ? "framing-info" : "framing-warning",
      message: knownLovableHost
        ? "Page loaded inside Lovable preview iframe"
        : ancestors.length === 0
          ? "Page is framed; ancestor origin hidden by browser (cross-origin)"
          : `Page is framed by unexpected origin(s): ${ancestors.join(", ")}`,
      topOrigin,
      ancestorOrigins: ancestors,
      referrer: document.referrer || undefined,
      documentUri: location.href,
    });
  }
}
