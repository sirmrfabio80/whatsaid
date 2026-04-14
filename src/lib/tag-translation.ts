import { supabase } from "@/integrations/supabase/client";

// In-memory session cache: "lang:tagName" → translated string
const cache = new Map<string, string>();

// Pending requests to avoid duplicate concurrent calls
const pending = new Map<string, Promise<Map<string, string>>>();

/**
 * Translate an array of English tag names to the target language.
 * Returns a Map from English name → translated name.
 * Results are cached in-memory per session.
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
  for (const t of tags) {
    const key = `${targetLang}:${t}`;
    if (cache.has(key)) {
      result.set(t, cache.get(key)!);
    } else {
      uncached.push(t);
    }
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
