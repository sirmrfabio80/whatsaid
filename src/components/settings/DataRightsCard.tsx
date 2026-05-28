/**
 * Settings → "Your data" card.
 *
 * Self-service UK GDPR controls for the signed-in user:
 *   - Art. 15/20: download a portable ZIP of their data (calls `dsr-export`).
 *   - Art. 16:    open a tracked rectification request for fields they
 *                 cannot edit themselves (email / country).
 *
 * Other rights:
 *   - Erasure → the existing Danger zone "Delete account" button.
 *   - Restriction / Objection → handled out-of-band via support email; we
 *     link to it in the card footer.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Download, FileEdit, Loader2, Eraser } from "lucide-react";
import { toast } from "sonner";
import { STORAGE_INVENTORY } from "@/lib/cookie-inventory";

type RectField = "email" | "country";

export default function DataRightsCard() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [field, setField] = useState<RectField>("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingByField, setPendingByField] = useState<Record<string, boolean>>({});

  async function loadPending() {
    const { data } = await supabase
      .from("dsr_requests")
      .select("field, status")
      .eq("kind", "rectification")
      .eq("status", "pending");
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((r: any) => { if (r.field) map[r.field] = true; });
    setPendingByField(map);
  }

  useEffect(() => { loadPending(); }, []);

  async function handleExport() {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("dsr-export");
      if (error) throw error;
      if (data?.signed_url) {
        // Open in a new tab so the user keeps Settings context.
        window.open(data.signed_url, "_blank", "noopener,noreferrer");
        toast.success(t("settings.dataRights.downloadSuccess"));
      } else {
        toast.error(t("settings.dataRights.downloadNoLink"));
      }
    } catch (err: any) {
      const msg = err?.context?.error ?? err?.message ?? t("settings.dataRights.downloadFailed");
      toast.error(typeof msg === "string" ? msg : t("settings.dataRights.downloadFailed"));
    } finally {
      setExporting(false);
    }
  }

  async function submitRectification() {
    if (!value.trim() || reason.trim().length < 10) {
      toast.error(t("settings.dataRights.rectifyValidation"));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("dsr-rectification-request", {
        body: { field, requested_value: value.trim(), reason: reason.trim() },
      });
      if (error) throw error;
      toast.success(t("settings.dataRights.rectifySuccess"));
      setOpenDialog(false);
      setValue("");
      setReason("");
      loadPending();
    } catch (err: any) {
      const msg = err?.context?.error ?? err?.message ?? t("settings.dataRights.rectifyFailed");
      toast.error(typeof msg === "string" ? msg : t("settings.dataRights.rectifyFailed"));
    } finally {
      setSubmitting(false);
    }
  }
  }

  return (
    <Card className="rounded-xl border-border bg-card shadow-sm">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-h2">{t("settings.dataRights.title")}</h2>
          <p className="text-body-sm text-muted-foreground mt-1">
            {t("settings.dataRights.subtitle")}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <h3 className="font-medium text-sm">{t("settings.dataRights.downloadTitle")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("settings.dataRights.downloadDesc")}
            </p>
            <Button onClick={handleExport} disabled={exporting} size="sm" className="rounded-lg">
              {exporting ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t("settings.dataRights.downloadPreparing")}</>
              ) : (
                <><Download className="w-4 h-4 mr-1.5" />{t("settings.dataRights.downloadBtn")}</>
              )}
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-2">
            <h3 className="font-medium text-sm">{t("settings.dataRights.rectifyTitle")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("settings.dataRights.rectifyDesc")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setOpenDialog(true)}
            >
              <FileEdit className="w-4 h-4 mr-1.5" />{t("settings.dataRights.rectifyBtn")}
            </Button>
            {Object.keys(pendingByField).length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("settings.dataRights.rectifyPending", { fields: Object.keys(pendingByField).join(", ") })}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border p-4 space-y-2">
          <h3 className="font-medium text-sm">{t("settings.dataRights.clearTitle")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.dataRights.clearDescPrefix")}
            <a href="/cookies" className="underline hover:text-foreground">
              {t("settings.dataRights.clearDescLink")}
            </a>
            {t("settings.dataRights.clearDescSuffix")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => {
              let cleared = 0;
              try {
                for (const entry of STORAGE_INVENTORY) {
                  if (entry.category !== "functional") continue;
                  const store = entry.storage === "sessionStorage" ? window.sessionStorage : window.localStorage;
                  if (entry.match === "exact") {
                    if (store.getItem(entry.key) !== null) {
                      store.removeItem(entry.key);
                      cleared++;
                    }
                  } else {
                    for (let i = store.length - 1; i >= 0; i--) {
                      const k = store.key(i);
                      if (k && k.startsWith(entry.key)) {
                        store.removeItem(k);
                        cleared++;
                      }
                    }
                  }
                }
                toast.success(
                  t("settings.dataRights.clearSuccess", {
                    count: cleared,
                    noun: cleared === 1
                      ? t("settings.dataRights.clearItemSingular")
                      : t("settings.dataRights.clearItemPlural"),
                  })
                );
              } catch {
                toast.error(t("settings.dataRights.clearFailed"));
              }
            }}
          >
            <Eraser className="w-4 h-4 mr-1.5" />{t("settings.dataRights.clearBtn")}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("settings.dataRights.erasureNote")}
        </p>
      </CardContent>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.dataRights.rectifyDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("settings.dataRights.rectifyDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("settings.dataRights.rectifyFieldLabel")}</Label>
              <Select value={field} onValueChange={(v) => setField(v as RectField)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email" disabled={!!pendingByField.email}>
                    {t("settings.dataRights.rectifyFieldEmail")}
                    {pendingByField.email ? t("settings.dataRights.rectifyFieldPendingSuffix") : ""}
                  </SelectItem>
                  <SelectItem value="country" disabled={!!pendingByField.country}>
                    {t("settings.dataRights.rectifyFieldCountry")}
                    {pendingByField.country ? t("settings.dataRights.rectifyFieldPendingSuffix") : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rect-value">{t("settings.dataRights.rectifyValueLabel")}</Label>
              <Input
                id="rect-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={field === "email" ? "you@example.com" : "GB"}
                maxLength={field === "country" ? 2 : 320}
              />
            </div>
            <div>
              <Label htmlFor="rect-reason">{t("settings.dataRights.rectifyReasonLabel")}</Label>
              <Textarea
                id="rect-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={t("settings.dataRights.rectifyReasonPlaceholder")}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground mt-1">{reason.length}/2000</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDialog(false)} disabled={submitting}>
              {t("settings.dataRights.rectifyCancel")}
            </Button>
            <Button onClick={submitRectification} disabled={submitting || pendingByField[field]}>
              {submitting ? t("settings.dataRights.rectifySubmitting") : t("settings.dataRights.rectifySubmit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
}
