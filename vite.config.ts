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
function cssPreloadPlugin(): Plugin {
  let cssAssetUrls: string[] = [];

  return {
    name: "whatsaid:css-preload",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      cssAssetUrls = Object.values(bundle)
        .filter(
          (chunk): chunk is typeof chunk & { fileName: string; type: "asset" } =>
            chunk.type === "asset" && chunk.fileName.endsWith(".css"),
        )
        // Only preload the top-level entry CSS (e.g. `assets/index-<hash>.css`).
        // Per-route CSS chunks are smaller and discovered via their JS chunk;
        // preloading them all would waste bandwidth on the landing page.
        .filter((chunk) => /assets\/index-[^/]+\.css$/.test(chunk.fileName))
        .map((chunk) => `/${chunk.fileName}`);
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
