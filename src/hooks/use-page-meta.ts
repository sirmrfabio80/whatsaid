import { useEffect } from "react";

interface PageMeta {
  title?: string;
  description?: string;
  ogImage?: string; // absolute URL
  canonical?: string; // absolute URL
}

const SITE_URL = "https://whatsaid.app";
const DEFAULTS = {
  title: "WhatSaid — AI Audio Transcription with Speaker Labels",
  description:
    "Upload audio files and get instant transcriptions with speaker labels, summaries, and custom AI analysis. Supports .m4a, .mp3, .wav. No subscription required.",
  ogImage: `${SITE_URL}/og-image.png`,
  canonical: SITE_URL,
};

function setMetaByName(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProp(property: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Updates the document title, meta description, OG/Twitter tags and canonical
 * link for the current page. Restores the site defaults on unmount so SPA
 * navigation between pages always reflects the active route.
 */
export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    const title = meta.title ?? DEFAULTS.title;
    const description = meta.description ?? DEFAULTS.description;
    const ogImage = meta.ogImage ?? DEFAULTS.ogImage;
    const canonical = meta.canonical ?? DEFAULTS.canonical;

    document.title = title;
    setMetaByName("description", description);
    setMetaByProp("og:title", title);
    setMetaByName("twitter:title", title);
    setMetaByProp("og:description", description);
    setMetaByName("twitter:description", description);
    setMetaByProp("og:image", ogImage);
    setMetaByName("twitter:image", ogImage);
    setMetaByProp("og:url", canonical);
    setCanonical(canonical);

    return () => {
      // Restore site-wide defaults on unmount
      document.title = DEFAULTS.title;
      setMetaByName("description", DEFAULTS.description);
      setMetaByProp("og:title", DEFAULTS.title);
      setMetaByName("twitter:title", DEFAULTS.title);
      setMetaByProp("og:description", DEFAULTS.description);
      setMetaByName("twitter:description", DEFAULTS.description);
      setMetaByProp("og:image", DEFAULTS.ogImage);
      setMetaByName("twitter:image", DEFAULTS.ogImage);
      setMetaByProp("og:url", DEFAULTS.canonical);
      setCanonical(DEFAULTS.canonical);
    };
  }, [meta.title, meta.description, meta.ogImage, meta.canonical]);
}
