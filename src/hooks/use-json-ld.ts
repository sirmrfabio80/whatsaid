import { useEffect } from "react";

/**
 * Injects a JSON-LD structured-data <script> into <head> for the lifetime of
 * the component. Identified by `id` so updates replace prior content and
 * unmounting cleans it up — preventing duplicate or stale schema across SPA
 * navigation.
 */
export function useJsonLd(
  id: string,
  data: Record<string, unknown> | Array<Record<string, unknown>> | null,
) {
  useEffect(() => {
    if (!data) return;
    let el = document.getElementById(id) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);

    return () => {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
    };
  }, [id, JSON.stringify(data)]);
}
