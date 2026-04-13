import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export function useHistoryFilters(userId: string | undefined) {
  const [userTags, setUserTags] = useState<TagOption[]>([]);
  const [jobTagMappings, setJobTagMappings] = useState<JobTagMapping[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  // Fetch job-tag mappings
  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("job_tags")
        .select("job_id, tag_id");
      setJobTagMappings((data as JobTagMapping[]) ?? []);
    };
    fetch();
  }, [userId]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
