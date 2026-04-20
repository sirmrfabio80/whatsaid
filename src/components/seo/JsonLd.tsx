import { useEffect, useId } from "react";

interface JsonLdProps {
  /** A JSON-LD object (or array). Will be serialized into a `<script>` tag in `<head>`. */
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

/**
 * Injects a JSON-LD `<script type="application/ld+json">` into `document.head`
 * for the lifetime of the component, then removes it on unmount. SPA-safe.
 *
 * Use one instance per logical schema (e.g. SoftwareApplication on `/`).
 * Site-wide schemas (Organization, WebSite) live in `index.html`.
 */
export function JsonLd({ data }: JsonLdProps) {
  const id = useId();

  useEffect(() => {
    const scriptId = `jsonld-${id}`;
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    try {
      script.textContent = JSON.stringify(data);
    } catch {
      script.textContent = "";
    }
    return () => {
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [id, data]);

  return null;
}

export default JsonLd;
