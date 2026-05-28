import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  LAWFUL_BASES,
  UPLOAD_ATTESTATION_VERSION,
  getUploadAttestationStrings,
  type LawfulBasis,
} from "@/lib/upload-attestation-strings";

export interface UploadAttestationPayload {
  version: string;
  basis: LawfulBasis;
  contextNote: string | null;
}

interface Props {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (payload: UploadAttestationPayload) => void;
}

/**
 * Pre-upload UK GDPR Art. 6 / Art. 14 attestation gate.
 *
 * - Two required acknowledgements + a required lawful-basis radio.
 * - Optional 280-char context note retained on the consent row for audits.
 * - Cancel / ESC / outside click discard everything and never start the upload.
 */
export function UploadAttestationDialog({
  open,
  loading,
  onCancel,
  onConfirm,
}: Props) {
  const { i18n } = useTranslation();
  const strings = getUploadAttestationStrings(i18n.language);
  const descId = useId();

  const [lawfulAck, setLawfulAck] = useState(false);
  const [art14Ack, setArt14Ack] = useState(false);
  const [basis, setBasis] = useState<LawfulBasis | "">("");
  const [contextNote, setContextNote] = useState("");

  useEffect(() => {
    if (!open) {
      setLawfulAck(false);
      setArt14Ack(false);
      setBasis("");
      setContextNote("");
    }
  }, [open]);

  const canContinue =
    lawfulAck && art14Ack && basis !== "" && !loading;

  const handleConfirm = () => {
    if (!canContinue) return;
    onConfirm({
      version: UPLOAD_ATTESTATION_VERSION,
      basis: basis as LawfulBasis,
      contextNote: contextNote.trim() ? contextNote.trim().slice(0, 280) : null,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        aria-describedby={descId}
        onEscapeKeyDown={() => onCancel()}
      >
        <DialogHeader>
          <DialogTitle>{strings.title}</DialogTitle>
          <DialogDescription id={descId}>{strings.intro}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{strings.basisLabel}</Label>
            <RadioGroup
              value={basis}
              onValueChange={(v) => setBasis(v as LawfulBasis)}
              className="space-y-1"
            >
              {LAWFUL_BASES.map((b) => (
                <label
                  key={b}
                  htmlFor={`basis-${b}`}
                  className="flex items-start gap-3 min-h-[44px] cursor-pointer rounded-md px-2 py-1 hover:bg-muted/40"
                >
                  <RadioGroupItem id={`basis-${b}`} value={b} className="mt-1" />
                  <span className="text-sm leading-relaxed">
                    {strings.basisOptions[b]}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <Checkbox
              checked={lawfulAck}
              onCheckedChange={(v) => setLawfulAck(v === true)}
              className="mt-0.5"
              aria-label="Acknowledge lawful basis"
            />
            <span className="text-sm leading-relaxed">
              {strings.acknowledgeLawful}
            </span>
          </label>

          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
            <Checkbox
              checked={art14Ack}
              onCheckedChange={(v) => setArt14Ack(v === true)}
              className="mt-0.5"
              aria-label="Acknowledge Article 14 notice duty"
            />
            <span className="text-sm leading-relaxed">
              {strings.acknowledgeArt14}
            </span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="upload-attestation-context" className="text-sm font-medium">
              {strings.contextLabel}
            </Label>
            <Textarea
              id="upload-attestation-context"
              value={contextNote}
              maxLength={280}
              onChange={(e) => setContextNote(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{strings.contextHelper}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            <Link
              to="/privacy#uploader-duties"
              target="_blank"
              rel="noopener"
              className="underline"
            >
              {strings.privacyLink}
            </Link>
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {strings.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={!canContinue}>
            {loading ? "…" : strings.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
