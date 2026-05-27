import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { RefreshCw, Pencil, Database } from "lucide-react";
import { toast } from "sonner";

interface RetentionRow {
  id: string;
  dataset_key: string;
  description: string | null;
  legal_basis: string | null;
  retention_days: number;
  strategy: "delete" | "anonymize";
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

interface AuditRow {
  id: string;
  dataset_key: string;
  changed_by: string | null;
  changed_at: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string | null;
}

const TRACKED_FIELDS: Array<keyof RetentionRow> = [
  "retention_days",
  "strategy",
  "enabled",
  "description",
  "legal_basis",
];

function formatDiff(before: Record<string, unknown>, after: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of TRACKED_FIELDS) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      parts.push(`${key}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
    }
  }
  return parts.join(", ") || "(no tracked changes)";
}

export default function RetentionTab() {
  const [rows, setRows] = useState<RetentionRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RetentionRow | null>(null);
  const [form, setForm] = useState({
    retention_days: 0,
    strategy: "delete" as "delete" | "anonymize",
    enabled: true,
    description: "",
    legal_basis: "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg, error: cfgErr }, { data: log, error: logErr }] = await Promise.all([
      supabase.from("retention_config").select("*").order("dataset_key"),
      supabase
        .from("retention_config_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(50),
    ]);
    if (cfgErr) toast.error(`Failed to load config: ${cfgErr.message}`);
    if (logErr) toast.error(`Failed to load audit: ${logErr.message}`);
    setRows((cfg as RetentionRow[] | null) ?? []);
    setAudit((log as AuditRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (row: RetentionRow) => {
    setEditing(row);
    setForm({
      retention_days: row.retention_days,
      strategy: row.strategy,
      enabled: row.enabled,
      description: row.description ?? "",
      legal_basis: row.legal_basis ?? "",
      reason: "",
    });
  };

  const save = async () => {
    if (!editing) return;
    if (form.reason.trim().length < 5) {
      toast.error("Please describe the reason for this change (min 5 chars).");
      return;
    }
    if (form.retention_days < 0 || form.retention_days > 3650) {
      toast.error("Retention days must be between 0 and 3650.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_retention_config", {
      p_dataset_key: editing.dataset_key,
      p_retention_days: form.retention_days,
      p_strategy: form.strategy,
      p_enabled: form.enabled,
      p_description: form.description || null,
      p_legal_basis: form.legal_basis || null,
      p_reason: form.reason.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success(`Updated ${editing.dataset_key}`);
    setEditing(null);
    void load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" aria-hidden /> Retention
            </CardTitle>
            <CardDescription>
              Configure how long each dataset is retained. Every change is audited.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <LoadingState label="Loading retention config…" />
          ) : rows.length === 0 ? (
            <EmptyState title="No retention rows" description="Seed defaults are missing." />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-border/50 bg-card/50 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.dataset_key}</span>
                      <Badge variant={row.enabled ? "default" : "secondary"}>
                        {row.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge variant="outline">{row.strategy}</Badge>
                      <Badge variant="outline">{row.retention_days} days</Badge>
                    </div>
                    {row.description && (
                      <p className="text-body-sm text-muted-foreground mt-1">{row.description}</p>
                    )}
                    {row.legal_basis && (
                      <p className="text-caption text-muted-foreground mt-1">
                        Legal basis: <code>{row.legal_basis}</code>
                      </p>
                    )}
                    <p className="text-caption text-muted-foreground mt-1">
                      Last updated {new Date(row.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change history</CardTitle>
          <CardDescription>Latest 50 retention setting changes.</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <EmptyState title="No changes yet" description="The audit log is empty." />
          ) : (
            <div className="space-y-3">
              {audit.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border/50 bg-card/50 p-3 text-body-sm"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium">{entry.dataset_key}</span>
                    <span className="text-caption text-muted-foreground">
                      {new Date(entry.changed_at).toLocaleString()}
                    </span>
                    {entry.changed_by && (
                      <code className="text-caption text-muted-foreground">
                        {entry.changed_by.slice(0, 8)}…
                      </code>
                    )}
                  </div>
                  <div className="text-foreground/80 font-mono text-caption break-all">
                    {formatDiff(entry.before, entry.after)}
                  </div>
                  {entry.reason && (
                    <p className="text-caption text-muted-foreground mt-1">
                      Reason: {entry.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit {editing?.dataset_key}</SheetTitle>
            <SheetDescription>
              Changes are recorded in the audit log with your reason.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="retention_days">Retention days</Label>
              <Input
                id="retention_days"
                type="number"
                min={0}
                max={3650}
                value={form.retention_days}
                onChange={(e) =>
                  setForm((f) => ({ ...f, retention_days: Number(e.target.value) }))
                }
              />
              <p className="text-caption text-muted-foreground">
                0–3650. Set to 0 to disable retention for this dataset.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="strategy">Strategy</Label>
              <Select
                value={form.strategy}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, strategy: v as "delete" | "anonymize" }))
                }
              >
                <SelectTrigger id="strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="anonymize">Anonymize</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <Label htmlFor="enabled" className="cursor-pointer">
                  Enabled
                </Label>
                <p className="text-caption text-muted-foreground">
                  Disabled rows are skipped by the sweeper.
                </p>
              </div>
              <Switch
                id="enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_basis">Legal basis</Label>
              <Input
                id="legal_basis"
                value={form.legal_basis}
                onChange={(e) => setForm((f) => ({ ...f, legal_basis: e.target.value }))}
                placeholder="e.g. contract_6y"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Why are you changing this? (min 5 chars)"
                rows={3}
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
