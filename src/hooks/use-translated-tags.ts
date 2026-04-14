import { useState, useEffect, useRef } from "react";
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
  const [displayMap, setDisplayMap] = useState<Map<string, string>>(new Map());
  const prevKey = useRef("");

  useEffect(() => {
    if (tags.length === 0 || lang === "en") {
      setDisplayMap(new Map());
      return;
    }

    const names = tags.map((t) => t.name);
    const key = `${lang}:${names.sort().join("|")}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    let cancelled = false;
    translateTags(names, lang).then((map) => {
      if (!cancelled) setDisplayMap(map);
    });

    return () => { cancelled = true; };
  }, [tags, lang]);

  return tags.map((tag) => ({
    ...tag,
    displayName: (lang === "en" ? tag.name : displayMap.get(tag.name)) ?? tag.name,
  }));
}
