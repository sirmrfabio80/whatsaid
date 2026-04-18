import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export interface TagOption {
  id: string;
  name: string;
  normalized_name: string;
  color: string | null;
  source: string;
}

interface JobTagMapping {
  job_id: string;
  tag_id: string;
}

export function useHistoryFilters(userId: string | undefined, jobIds: string[] = []) {
  const [userTags, setUserTags] = useState<TagOption[]>([]);
  const [jobTagMappings, setJobTagMappings] = useState<JobTagMapping[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [tagsLoading, setTagsLoading] = useState(false);

  // Fetch user tags
  useEffect(() => {
    if (!userId) return;
    setTagsLoading(true);
    const fetch = async () => {
      const { data } = await supabase
        .from("tags")
        .select("id, name, normalized_name, color, source")
        .eq("user_id", userId)
        .order("name");
      setUserTags((data as TagOption[]) ?? []);
      setTagsLoading(false);
    };
    fetch();
  }, [userId]);

  // Fetch job-tag mappings scoped to loaded jobs
  useEffect(() => {
    if (!userId || jobIds.length === 0) {
      setJobTagMappings([]);
      return;
    }
    const fetchMappings = async () => {
      // Supabase .in() has a practical limit; batch in chunks of 200
      const chunks: JobTagMapping[] = [];
      for (let i = 0; i < jobIds.length; i += 200) {
        const slice = jobIds.slice(i, i + 200);
        const { data } = await supabase
          .from("job_tags")
          .select("job_id, tag_id")
          .in("job_id", slice);
        if (data) chunks.push(...(data as JobTagMapping[]));
      }
      setJobTagMappings(chunks);
    };
    fetchMappings();
  }, [userId, jobIds.join(",")]);

  // Search debouncing handled via useDebouncedValue above.

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const clearAll = useCallback(() => {
    setSelectedTagIds([]);
    setSearchQuery("");
  }, []);

  const hasActiveFilters = selectedTagIds.length > 0 || debouncedSearch.length > 0;

  // Build a set of job IDs that match selected tags (intersection)
  const tagFilteredJobIds = useMemo(() => {
    if (selectedTagIds.length === 0) return null; // no tag filter
    // For each selected tag, get set of job_ids
    const sets = selectedTagIds.map((tagId) => {
      const ids = new Set<string>();
      for (const m of jobTagMappings) {
        if (m.tag_id === tagId) ids.add(m.job_id);
      }
      return ids;
    });
    // Intersection
    if (sets.length === 0) return new Set<string>();
    let result = sets[0];
    for (let i = 1; i < sets.length; i++) {
      result = new Set([...result].filter((id) => sets[i].has(id)));
    }
    return result;
  }, [selectedTagIds, jobTagMappings]);

  // Get tags for a specific job
  const getJobTags = useCallback(
    (jobId: string): TagOption[] => {
      const tagIds = jobTagMappings
        .filter((m) => m.job_id === jobId)
        .map((m) => m.tag_id);
      return userTags.filter((t) => tagIds.includes(t.id));
    },
    [jobTagMappings, userTags]
  );

  // Autocomplete suggestions (exclude already selected)
  const tagSuggestions = useMemo(() => {
    return userTags.filter((t) => !selectedTagIds.includes(t.id));
  }, [userTags, selectedTagIds]);

  const selectedTags = useMemo(() => {
    return userTags.filter((t) => selectedTagIds.includes(t.id));
  }, [userTags, selectedTagIds]);

  return {
    userTags,
    tagsLoading,
    selectedTagIds,
    selectedTags,
    tagSuggestions,
    toggleTag,
    searchQuery,
    setSearchQuery,
    debouncedSearch,
    clearAll,
    hasActiveFilters,
    tagFilteredJobIds,
    getJobTags,
  };
}
