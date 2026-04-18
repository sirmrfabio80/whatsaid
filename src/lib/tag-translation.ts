import { supabase } from "@/integrations/supabase/client";

// Cache version — bump when normalization rules change to invalidate old entries.
const CACHE_VERSION = "v1";
const STORAGE_KEY = `tagTranslations:${CACHE_VERSION}`;
const MAX_CACHE_ENTRIES = 2000;
const PERSIST_DEBOUNCE_MS = 500;

// In-memory cache: "lang:tagName" → translated string.
// Insertion order acts as recency for LRU eviction (Map preserves insertion order).
const cache = new Map<string, string>();

// Pending requests to avoid duplicate concurrent calls.
const pending = new Map<string, Promise<Map<string, string>>>();

// --- Persistent cache (localStorage) -------------------------------------

let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<[string, string]>;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string") {
          cache.set(entry[0], entry[1]);
        }
      }
      if (import.meta.env.DEV) {
        console.debug(`[tag-translation] hydrated ${cache.size} entries from localStorage`);
      }
    }
  } catch (e) {
    // Corrupt cache — clear and move on.
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function schedulePersist() {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      // LRU eviction: keep the most-recently-inserted MAX_CACHE_ENTRIES.
      let entries = [...cache.entries()];
      if (entries.length > MAX_CACHE_ENTRIES) {
        entries = entries.slice(entries.length - MAX_CACHE_ENTRIES);
        cache.clear();
        for (const [k, v] of entries) cache.set(k, v);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Quota exceeded or unavailable — ignore; in-memory cache still works.
    }
  }, PERSIST_DEBOUNCE_MS);
}

// Hydrate on module load.
hydrateFromStorage();

// --- Public API ----------------------------------------------------------

/**
 * Translate an array of English tag names to the target language.
 * Returns a Map from English name → translated name.
 * Results are cached in-memory and persisted to localStorage.
 */
export async function translateTags(
  tags: string[],
  targetLang: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  if (targetLang === "en" || tags.length === 0) {
    for (const t of tags) result.set(t, t);
    return result;
  }

  // Separate cached vs uncached
  const uncached: string[] = [];
  let hits = 0;
  for (const t of tags) {
    const key = `${targetLang}:${t}`;
    if (cache.has(key)) {
      result.set(t, cache.get(key)!);
      hits++;
    } else {
      uncached.push(t);
    }
  }

  if (import.meta.env.DEV && tags.length > 0) {
    console.debug(
      `[tag-translation] ${targetLang}: ${hits} hit(s), ${uncached.length} miss(es)`
    );
  }

  if (uncached.length === 0) return result;

  // Deduplicate and batch
  const unique = [...new Set(uncached)];
  const batchKey = `${targetLang}:${unique.sort().join("|")}`;

  let fetchPromise = pending.get(batchKey);
  if (!fetchPromise) {
    fetchPromise = fetchTranslations(unique, targetLang);
    pending.set(batchKey, fetchPromise);
    fetchPromise.finally(() => pending.delete(batchKey));
  }

  const translations = await fetchPromise;

  for (const t of uncached) {
    const translated = translations.get(t) ?? t;
    const key = `${targetLang}:${t}`;
    cache.set(key, translated);
    result.set(t, translated);
  }

  schedulePersist();

  return result;
}

async function fetchTranslations(
  tags: string[],
  targetLang: string
): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.functions.invoke("translate-tags", {
      body: { tags, target_lang: targetLang },
    });

    if (error || !data?.translations) {
      console.warn("Tag translation failed, using originals:", error);
      const fallback = new Map<string, string>();
      for (const t of tags) fallback.set(t, t);
      return fallback;
    }

    const result = new Map<string, string>();
    const translations = data.translations as Record<string, string>;
    for (const t of tags) {
      result.set(t, translations[t] ?? t);
    }
    return result;
  } catch (e) {
    console.warn("Tag translation error:", e);
    const fallback = new Map<string, string>();
    for (const t of tags) fallback.set(t, t);
    return fallback;
  }
}
