/**
 * Admin DSR queue — UK GDPR Art. 15/16/20 oversight.
 *
 * Lists every `dsr_requests` row with filters for status + kind. Admins can:
 *   - Apply a rectification request → calls `admin_apply_rectification` RPC,
 *     which atomically updates the target column and stamps the row as
 *     fulfilled.
 *   - Reject with a note → simple UPDATE on the row.
 *
 * Portability rows (the user-triggered ZIP exports) appear here read-only as
 * an audit trail. We do NOT expose the signed URL — it was time-limited and
 * delivered to the user directly.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type DsrRow = {
  id: string;
  user_id: string | null;
  kind: "access" | "rectification" | "portability" | "erasure";
  status: "pending" | "in_progress" | "fulfilled" | "rejected";
  requested_via: string;
  field: string | null;
  requested_value: string | null;
  reason: string | null;
  notes: string | null;
  export_storage_path: string | null;
  export_expires_at: string | null;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  created_at: string;
  updated_at: string;
};

const statusVariant: Record<DsrRow["status"], "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  in_progress: "secondary",
  fulfilled: "outline",
  rejected: "destructive",
};

export default function DsrTab() {
  const [rows, setRows] = useState<DsrRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [editing, setEditing] = useState<DsrRow | null>(null);
  const [newValue, setNewValue] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("dsr_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(`Could not load DSRs: ${error.message}`);
    } else {
      setRows((data ?? []) as DsrRow[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, kindFilter, statusFilter]);

  function openEditor(row: DsrRow) {
    setEditing(row);
    setNewValue(row.requested_value ?? "");
    setAdminNote("");
  }

  async function applyRectification() {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_apply_rectification", {
      p_request_id: editing.id,
      p_new_value: newValue,
      p_note: adminNote || null,
    });
    setBusy(false);
    if (error) {
      toast.error(`Apply failed: ${error.message}`);
      return;
    }
    toast.success("Rectification applied");
    setEditing(null);
    load();
  }

  async function rejectRequest() {
    if (!editing) return;
    if (!adminNote.trim()) {
      toast.error("A reason is required to reject");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("dsr_requests")
      .update({
        status: "rejected",
        notes: adminNote,
        fulfilled_at: new Date().toISOString(),
      })
      .eq("id", editing.id);
    setBusy(false);
    if (error) {
      toast.error(`Reject failed: ${error.message}`);
      return;
    }
    toast.success("Request rejected");
    setEditing(null);
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <div>
          <CardTitle>Data subject requests</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            UK GDPR Art. 15/16/20 — fulfil within 30 days. Portability rows are read-only audit entries.
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">Kind</Label>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="rectification">Rectification</SelectItem>
                <SelectItem value="portability">Portability</SelectItem>
                <SelectItem value="access">Access</SelectItem>
                <SelectItem value="erasure">Erasure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="fulfilled">Fulfilled</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Requested value</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No matching requests.</TableCell></TableRow>
              )}
              {!loading && filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                  <TableCell><Badge variant={statusVariant[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell className="text-xs">{r.field ?? "—"}</TableCell>
                  <TableCell className="text-xs max-w-[240px] truncate" title={r.requested_value ?? ""}>
                    {r.requested_value ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.user_id?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {r.kind === "rectification" && r.status === "pending" ? (
                      <Button size="sm" variant="outline" onClick={() => openEditor(r)}>
                        Review
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review rectification request</DialogTitle>
            <DialogDescription>
              Apply the change directly, or reject with a documented reason.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="text-sm grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Field</span>
                <span className="col-span-2 font-medium">{editing.field}</span>
                <span className="text-muted-foreground">User ID</span>
                <span className="col-span-2 font-mono text-xs break-all">{editing.user_id}</span>
                <span className="text-muted-foreground">Submitted</span>
                <span className="col-span-2">{new Date(editing.created_at).toLocaleString()}</span>
              </div>
              <div>
                <Label className="text-xs">User's stated reason</Label>
                <div className="p-3 rounded-md bg-muted text-sm whitespace-pre-wrap mt-1">
                  {editing.reason ?? "(none)"}
                </div>
              </div>
              <div>
                <Label htmlFor="dsr-new-value">Value to apply</Label>
                <Input
                  id="dsr-new-value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="dsr-note">Admin note (required for rejection)</Label>
                <Textarea
                  id="dsr-note"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={rejectRequest} disabled={busy}>Reject</Button>
            <Button onClick={applyRectification} disabled={busy || !newValue.trim()}>
              {busy ? "Working…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
