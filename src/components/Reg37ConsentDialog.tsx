import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";
import {
  REG37_CHECKBOX_IMMEDIATE_SUPPLY,
  REG37_CHECKBOX_RIGHT_LOSS,
  REG37_EXPLANATORY,
} from "@/lib/reg37-consent";

interface Props {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Pre-checkout Reg. 37 consent dialog.
 *
 * - Two separately required checkboxes (express consent + right-loss
 *   acknowledgement).
 * - Always shown per purchase — never session-cached.
 * - Closing the dialog (X / ESC / outside click) does NOT record consent and
 *   does NOT open checkout.
 */
export function Reg37ConsentDialog({
  open,
  loading,
  onCancel,
  onConfirm,
}: Props) {
  const [immediateSupply, setImmediateSupply] = useState(false);
  const [rightLoss, setRightLoss] = useState(false);
  const descId = useId();

  useEffect(() => {
    if (!open) {
      setImmediateSupply(false);
      setRightLoss(false);
    }
  }, [open]);

  const canContinue = immediateSupply && rightLoss && !loading;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        aria-describedby={descId}
        onEscapeKeyDown={() => onCancel()}
      >
        <DialogHeader>
          <DialogTitle>Before you pay — confirm immediate supply</DialogTitle>
          <DialogDescription id={descId}>{REG37_EXPLANATORY}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <Checkbox
              checked={immediateSupply}
              onCheckedChange={(v) => setImmediateSupply(v === true)}
              className="mt-0.5"
              aria-label="Consent to immediate supply"
            />
            <span className="text-sm leading-relaxed">
              {REG37_CHECKBOX_IMMEDIATE_SUPPLY}
            </span>
          </label>

          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <Checkbox
              checked={rightLoss}
              onCheckedChange={(v) => setRightLoss(v === true)}
              className="mt-0.5"
              aria-label="Acknowledge loss of 14-day cancellation right"
            />
            <span className="text-sm leading-relaxed">
              {REG37_CHECKBOX_RIGHT_LOSS}
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            See our{" "}
            <Link to="/refund-policy" className="underline" target="_blank" rel="noopener">
              Refund Policy
            </Link>{" "}
            for full details.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canContinue}>
            {loading ? "Opening checkout…" : "Continue to payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
