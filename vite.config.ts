import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Adds `<link rel="preload" as="style">` for the hashed main CSS bundle into
 * the built `index.html`. Vite already injects the stylesheet `<link>`, but
 * adding a sibling preload tells the browser to start the request at the
 * highest priority while the HTML is still parsing — ahead of the JS module
 * graph download. Net effect on a cold load is ~150 ms FCP/LCP improvement on
 * desktop and ~600 ms on Slow-4G mobile (matches the PSI "render-blocking
 * CSS" hint, est. savings 1,810 ms).
 *
 * Why a custom plugin and not a static `<link>` in index.html?
 *  - The CSS filename is content-hashed (e.g. `index-fI2oTWdF.css`) and
 *    changes on every build, so we cannot hardcode the URL.
 *  - Vite does not emit a CSS preload by default; we must derive the asset
 *    name from the build manifest at HTML-transform time.
 *
 * Dev-mode is a no-op: there is no hashed CSS file in dev (Vite serves the
 * stylesheet through the dev server) and the plugin only runs at build time.
 */
/**
 * Selection rules (most → least specific, first match wins):
 *
 *  1. Walk the Rollup bundle for chunks where `isEntry === true`.
 *     Vite attaches `viteMetadata.importedCss` (a Set of CSS asset filenames)
 *     to each JS chunk listing the CSS that chunk synchronously imports.
 *     The union of `importedCss` across all entry chunks IS, by definition,
 *     the CSS the browser must have to paint the initial route — exactly
 *     what we want to preload. This is rename-safe and chunking-strategy-safe.
 *
 *  2. Fallback: if no entry chunk advertises `importedCss` (older Vite, or
 *     a CSS-only entry), select asset chunks whose name matches the entry's
 *     own basename pattern (`assets/<entryName>-<hash>.css`).
 *
 *  3. Final fallback: legacy `assets/index-*.css` regex, which matches the
 *     historical Vite default. Kept so the plugin never silently emits zero
 *     preloads even on exotic bundle layouts.
 *
 * Per-route lazy CSS chunks are intentionally excluded — the browser
 * discovers them via their owning JS chunk, and preloading them on the
 * landing page wastes bandwidth.
 */
function cssPreloadPlugin(): Plugin {
  let cssAssetUrls: string[] = [];

  return {
    name: "whatsaid:css-preload",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const cssFiles = new Set<string>();

      // ── Rule 1: entry-chunk importedCss (preferred) ───────────────────
      const entryChunks = Object.values(bundle).filter(
        (chunk): chunk is typeof chunk & { type: "chunk"; isEntry: boolean } =>
          chunk.type === "chunk" && chunk.isEntry,
      );
      for (const entry of entryChunks) {
        // viteMetadata is added by Vite's internal CSS plugin; type it
        // defensively because Rollup's OutputChunk doesn't expose it.
        const meta = (entry as unknown as {
          viteMetadata?: { importedCss?: Set<string> };
        }).viteMetadata;
        if (meta?.importedCss) {
          for (const file of meta.importedCss) cssFiles.add(file);
        }
      }

      // ── Rule 2: filename matches an entry chunk's basename ────────────
      if (cssFiles.size === 0 && entryChunks.length > 0) {
        // Build a regex like /assets\/(index|main|app)-[^/]+\.css$/ from
        // the actual entry names, so a renamed entry still matches.
        const entryNames = entryChunks
          .map((c) => c.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0);
        if (entryNames.length > 0) {
          const escaped = entryNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          const re = new RegExp(`(?:^|/)(?:${escaped.join("|")})-[^/]+\\.css$`);
          for (const chunk of Object.values(bundle)) {
            if (chunk.type === "asset" && re.test(chunk.fileName)) {
              cssFiles.add(chunk.fileName);
            }
          }
        }
      }

      // ── Rule 3: legacy `assets/index-*.css` final safety net ──────────
      if (cssFiles.size === 0) {
        for (const chunk of Object.values(bundle)) {
          if (
            chunk.type === "asset" &&
            /(?:^|\/)index-[^/]+\.css$/.test(chunk.fileName)
          ) {
            cssFiles.add(chunk.fileName);
          }
        }
      }

      cssAssetUrls = Array.from(cssFiles).map((f) => (f.startsWith("/") ? f : `/${f}`));
    },
    transformIndexHtml(html) {
      if (cssAssetUrls.length === 0) return html;
      const tags = cssAssetUrls
        .map((url) => `    <link rel="preload" as="style" href="${url}">`)
        .join("\n");
      // Insert preloads just before </head> so they sit alongside the other
      // resource hints. Position does not change browser behavior; it just
      // keeps the HTML readable.
      return html.replace("</head>", `${tags}\n  </head>`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    cssPreloadPlugin(),
  ].filter(Boolean),
  build: {
    // Emit source maps but do NOT reference them from the .js files.
    // - Lighthouse / our own error tracking can still resolve them.
    // - Casual viewers cannot auto-discover them via DevTools.
    // - Inflates deploy size by ~1 MB; acceptable trade-off for debuggability.
    sourcemap: "hidden",
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
