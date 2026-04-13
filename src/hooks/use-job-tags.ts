import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Tag {
  id: string;
  name: string;
  normalized_name: string;
  source: string;
  color: string | null;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function useJobTags(jobId: string | undefined) {
  const { user } = useAuth();
  const [jobTags, setJobTags] = useState<Tag[]>([]);
  const [allUserTags, setAllUserTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!user || !jobId) return;
    setLoading(true);

    const [jtRes, allRes] = await Promise.all([
      supabase
        .from("job_tags")
        .select("tag_id, tags(id, name, normalized_name, source, color)")
        .eq("job_id", jobId),
      supabase
        .from("tags")
        .select("id, name, normalized_name, source, color")
        .eq("user_id", user.id)
        .order("name"),
    ]);

    if (jtRes.data) {
      const tags = jtRes.data
        .map((jt: any) => jt.tags as Tag | null)
        .filter(Boolean) as Tag[];
      setJobTags(tags);
    }
    if (allRes.data) setAllUserTags(allRes.data);
    setLoading(false);
  }, [user, jobId]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const addTag = useCallback(async (name: string) => {
    if (!user || !jobId) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const norm = normalize(trimmed);

    // Check if user already has this tag
    let tag = allUserTags.find((t) => t.normalized_name === norm);

    if (!tag) {
      // Create new tag
      const { data, error } = await supabase
        .from("tags")
        .insert({ user_id: user.id, name: trimmed, normalized_name: norm, source: "user" })
        .select("id, name, normalized_name, source, color")
        .single();
      if (error || !data) return;
      tag = data;
      setAllUserTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    }

    // Check if already assigned
    if (jobTags.some((t) => t.id === tag!.id)) return;

    const { error: linkError } = await supabase
      .from("job_tags")
      .insert({ job_id: jobId, tag_id: tag.id });
    if (!linkError) {
      setJobTags((prev) => [...prev, tag!]);
    }
  }, [user, jobId, allUserTags, jobTags]);

  const removeTag = useCallback(async (tagId: string) => {
    if (!jobId) return;
    await supabase.from("job_tags").delete().eq("job_id", jobId).eq("tag_id", tagId);
    setJobTags((prev) => prev.filter((t) => t.id !== tagId));
  }, [jobId]);

  const renameTag = useCallback(async (tagId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const norm = normalize(trimmed);

    // Check for conflict
    const conflict = allUserTags.find((t) => t.id !== tagId && t.normalized_name === norm);
    if (conflict) return false;

    const { error } = await supabase
      .from("tags")
      .update({ name: trimmed, normalized_name: norm })
      .eq("id", tagId);
    if (error) return false;

    const updater = (prev: Tag[]) =>
      prev.map((t) => (t.id === tagId ? { ...t, name: trimmed, normalized_name: norm } : t));
    setJobTags(updater);
    setAllUserTags(updater);
    return true;
  }, [allUserTags]);

  // Suggestions: user tags not already assigned
  const suggestions = allUserTags.filter(
    (t) => !jobTags.some((jt) => jt.id === t.id)
  );

  return { jobTags, suggestions, loading, addTag, removeTag, renameTag, refetch: fetchTags };
}
