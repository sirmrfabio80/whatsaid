import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  configsEqual,
  DEFAULT_TEMPLATE_CONFIG,
  parseTemplateConfig,
  TranscribeTemplateConfig,
} from "@/lib/transcribe-template";
import TemplateEditor from "./TemplateEditor";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  config: TranscribeTemplateConfig;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
}

export default function TranscribeTemplatesTab() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TranscribeTemplateConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const dirty = useMemo(() => {
    if (!selected || !draft) return false;
    return !configsEqual(selected.config, draft);
  }, [selected, draft]);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transcribe_settings_templates")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error(`Failed to load templates: ${error.message}`);
      setLoading(false);
      return;
    }

    const rows: TemplateRow[] = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      config: parseTemplateConfig(r.config),
      is_active: r.is_active,
      updated_at: r.updated_at,
      updated_by: r.updated_by,
      created_at: r.created_at,
    }));

    setTemplates(rows);
    setLoading(false);

    // Initial selection: prefer active, else first row
    if (!selectedId && rows.length > 0) {
      const active = rows.find((r) => r.is_active) ?? rows[0];
      setSelectedId(active.id);
      setDraft(active.config);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const trySelect = (id: string) => {
    if (id === selectedId) return;
    if (dirty) {
      setPendingSelectId(id);
      return;
    }
    doSelect(id);
  };

  const doSelect = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSelectedId(id);
    setDraft(t.config);
  };

  const handleConfirmSwitch = () => {
    if (pendingSelectId) {
      doSelect(pendingSelectId);
      setPendingSelectId(null);
    }
  };

  const handleUpdateCurrent = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("transcribe_settings_templates")
      .update({
        config: draft as unknown as Record<string, unknown>,
        updated_by: user?.id ?? null,
      })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success("Template updated");
    fetchTemplates();
  };

  const handleApply = async () => {
    if (!selected || selected.is_active) return;
    setSaving(true);
    // Two-step under one-active uniqueness: deactivate current active first.
    const { error: deactivateError } = await supabase
      .from("transcribe_settings_templates")
      .update({ is_active: false, updated_by: user?.id ?? null })
      .eq("is_active", true);
    if (deactivateError) {
      setSaving(false);
      toast.error(`Apply failed: ${deactivateError.message}`);
      return;
    }
    const { error } = await supabase
      .from("transcribe_settings_templates")
      .update({ is_active: true, updated_by: user?.id ?? null })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast.error(`Apply failed: ${error.message}`);
      return;
    }
    toast.success(`"${selected.name}" is now active`);
    fetchTemplates();
  };

  const openSaveAs = () => {
    setNewName(selected ? `${selected.name} (copy)` : "New template");
    setNewDescription("");
    setSaveAsOpen(true);
  };

  const handleSaveAs = async () => {
    if (!draft || !newName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("transcribe_settings_templates")
      .insert({
        name: newName.trim(),
        description: newDescription.trim() || null,
        config: draft as unknown as Record<string, unknown>,
        is_active: false,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });
    setSaving(false);
    if (error) {
      toast.error(`Create failed: ${error.message}`);
      return;
    }
    toast.success(`Template "${newName.trim()}" created`);
    setSaveAsOpen(false);
    fetchTemplates();
  };

  const handleDuplicate = async () => {
    if (!selected) return;
    const copyName = `${selected.name} (copy)`;
    setSaving(true);
    const { error } = await supabase
      .from("transcribe_settings_templates")
      .insert({
        name: copyName,
        description: selected.description,
        config: selected.config as unknown as Record<string, unknown>,
        is_active: false,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      });
    setSaving(false);
    if (error) {
      toast.error(`Duplicate failed: ${error.message}`);
      return;
    }
    toast.success(`Duplicated as "${copyName}"`);
    fetchTemplates();
  };

  const openRename = () => {
    if (!selected) return;
    setNewName(selected.name);
    setNewDescription(selected.description ?? "");
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!selected || !newName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("transcribe_settings_templates")
      .update({
        name: newName.trim(),
        description: newDescription.trim() || null,
        updated_by: user?.id ?? null,
      })
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast.error(`Rename failed: ${error.message}`);
      return;
    }
    toast.success("Template updated");
    setRenameOpen(false);
    fetchTemplates();
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (selected.is_active) {
      toast.error("Apply another template before deleting the active one.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("transcribe_settings_templates")
      .delete()
      .eq("id", selected.id);
    setSaving(false);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    toast.success("Template deleted");
    setDeleteOpen(false);
    setSelectedId(null);
    setDraft(null);
    fetchTemplates();
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="h-6 w-48 bg-muted/60 rounded animate-pulse" />
        <div className="h-32 w-full bg-muted/40 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      {/* Left column: templates list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Templates</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => {
                setDraft(DEFAULT_TEMPLATE_CONFIG);
                openSaveAs();
              }}
              aria-label="New template from defaults"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription className="text-xs">
            Active template is what production uses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          )}
          {templates.map((t) => {
            const isSelected = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => trySelect(t.id)}
                className={[
                  "w-full text-left rounded-lg px-3 py-2 transition-colors",
                  isSelected
                    ? "bg-muted border border-border"
                    : "hover:bg-muted/60 border border-transparent",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{t.name}</span>
                  {t.is_active && (
                    <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                      Active
                    </Badge>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {t.description}
                  </p>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* Right column: editor */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">
                  {selected?.name ?? "Select a template"}
                </CardTitle>
                {selected?.is_active && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Active
                  </Badge>
                )}
                {dirty && (
                  <Badge variant="outline" className="text-amber-600 border-amber-600/40">
                    Unsaved changes
                  </Badge>
                )}
              </div>
              {selected && (
                <CardDescription className="text-xs">
                  Last updated{" "}
                  {new Date(selected.updated_at).toLocaleString()}
                </CardDescription>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleApply}
                disabled={!selected || selected.is_active || saving || dirty}
                title={dirty ? "Save or discard changes first" : undefined}
              >
                <Upload className="w-4 h-4" />
                Apply template
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleUpdateCurrent}
                disabled={!selected || !dirty || saving}
              >
                <Save className="w-4 h-4" />
                Update current
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={openSaveAs}
                disabled={!draft || saving}
              >
                <Plus className="w-4 h-4" />
                Save as new
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDuplicate}
                disabled={!selected || saving}
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={openRename}
                disabled={!selected || saving}
              >
                <Pencil className="w-4 h-4" />
                Rename
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                disabled={!selected || saving || selected.is_active}
                title={
                  selected?.is_active
                    ? "Apply another template before deleting"
                    : undefined
                }
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {draft ? (
            <TemplateEditor
              value={draft}
              onChange={setDraft}
              disabled={saving}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a template on the left or create a new one.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Switch with unsaved changes confirmation */}
      <AlertDialog
        open={pendingSelectId !== null}
        onOpenChange={(o) => !o && setPendingSelectId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits in the current template. Switching will
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSwitch}>
              Discard and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save as new */}
      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as new template</DialogTitle>
            <DialogDescription>
              Saves the current editor values as a new template. It will not
              become active until you apply it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Diarization v2"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveAsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAs} disabled={!newName.trim() || saving}>
              Create template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim() || saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes "{selected?.name}". This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
