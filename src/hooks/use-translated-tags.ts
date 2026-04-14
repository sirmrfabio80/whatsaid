import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { translateTags } from "@/lib/tag-translation";

export interface TranslatedTag {
  id: string;
  name: string;
  displayName: string;
  normalized_name: string;
  source: string;
  color: string | null;
}

const EMPTY_MAP = new Map<string, string>();

/**
 * Takes an array of tags and returns them with a `displayName` field
 * translated to the current UI language. Falls back to `name` if
 * translation fails or for English users (no API call).
 */
export function useTranslatedTags<T extends { id: string; name: string; [key: string]: any }>(
  tags: T[]
): (T & { displayName: string })[] {
  const { i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] ?? "en";
  const [displayMap, setDisplayMap] = useState<Map<string, string>>(EMPTY_MAP);
  const prevKey = useRef("");

  // Stabilise the key derived from tags to avoid depending on array identity
  const tagKey = useMemo(() => {
    if (tags.length === 0) return "";
    return tags.map((t) => t.name).sort().join("|");
  }, [tags]);

  useEffect(() => {
    if (!tagKey || lang === "en") {
      // Only update if not already empty to avoid re-render loops
      setDisplayMap((prev) => (prev.size === 0 ? prev : EMPTY_MAP));
      return;
    }

    const key = `${lang}:${tagKey}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    let cancelled = false;
    translateTags(tagKey.split("|"), lang).then((map) => {
      if (!cancelled) setDisplayMap(map);
    });

    return () => { cancelled = true; };
  }, [tagKey, lang]);

  return useMemo(
    () =>
      tags.map((tag) => ({
        ...tag,
        displayName: (lang === "en" ? tag.name : displayMap.get(tag.name)) ?? tag.name,
      })),
    [tags, lang, displayMap]
  );
}
