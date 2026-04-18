import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, Check, X, Pencil, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FlagRow {
  id: string;
  tag_id: string;
  tag_name: string;
  detected_lang: string | null;
  status: string;
  created_at: string;
}

export default function OthersTab() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tag_quality_flags")
      .select("id, tag_id, tag_name, detected_lang, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message);
    } else {
      setFlags((data ?? []) as FlagRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rename(flag: FlagRow) {
    const newName = editValue.trim();
    if (!newName) return;
    setBusyId(flag.id);
    // Update tag name (trigger normalises name + invalidates translation cache)
    const { error: tagErr } = await supabase
      .from("tags")
      .update({ name: newName, source: "user" })
      .eq("id", flag.tag_id);
    if (tagErr) {
      toast.error(tagErr.message);
      setBusyId(null);
      return;
    }
    const { error: flagErr } = await supabase
      .from("tag_quality_flags")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", flag.id);
    if (flagErr) toast.error(flagErr.message);
    else toast.success(t("admin.others.renamed"));
    setEditingId(null);
    setEditValue("");
    setBusyId(null);
    load();
  }

  async function deleteTag(flag: FlagRow) {
    setBusyId(flag.id);
    const { error } = await supabase.from("tags").delete().eq("id", flag.tag_id);
    if (error) toast.error(error.message);
    else toast.success(t("admin.others.deleted"));
    setBusyId(null);
    load();
  }

  async function dismiss(flag: FlagRow) {
    setBusyId(flag.id);
    const { error } = await supabase
      .from("tag_quality_flags")
      .update({ status: "dismissed", resolved_at: new Date().toISOString() })
      .eq("id", flag.id);
    if (error) toast.error(error.message);
    else toast.success(t("admin.others.dismissed"));
    setBusyId(null);
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{t("admin.others.title")}</CardTitle>
          <CardDescription>{t("admin.others.desc")}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState rows={3} titleWidth="" />
        ) : flags.length === 0 ? (
          <EmptyState title={t("admin.others.empty")} description={t("admin.others.emptyDesc")} />
        ) : (
          <ul className="divide-y divide-border">
            {flags.map((flag) => {
              const isEditing = editingId === flag.id;
              const busy = busyId === flag.id;
              return (
                <li key={flag.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                        disabled={busy}
                        className="max-w-xs"
                      />
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{flag.tag_name}</span>
                        {flag.detected_lang && (
                          <Badge variant="secondary" className="text-xs">
                            {flag.detected_lang}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button size="sm" onClick={() => rename(flag)} disabled={busy || !editValue.trim()}>
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          <span className="ml-1">{t("admin.others.save")}</span>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditValue(""); }} disabled={busy}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditingId(flag.id); setEditValue(flag.tag_name); }}
                          disabled={busy}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          {t("admin.others.rename")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => dismiss(flag)} disabled={busy}>
                          {t("admin.others.dismiss")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteTag(flag)}
                          disabled={busy}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
