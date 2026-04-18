import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface UseCopyToClipboardOptions {
  /** Milliseconds to keep the "copied" state true. Default: 2000. */
  resetMs?: number;
  /** Optional toast message on success. Pass null/undefined to skip. */
  successMessage?: string | null;
  /** Optional toast message on failure. Pass null/undefined to skip. */
  errorMessage?: string | null;
}

/**
 * Shared clipboard hook.
 *
 * - `copy(text)` writes `text` to the clipboard, flips `copied` to true for
 *   `resetMs`, then back to false.
 * - `copyWithId(text, id)` is the multi-target variant: `copiedId` will hold
 *   the id of the last successfully-copied item until `resetMs` elapses.
 *
 * Optional success/error toasts are opt-in via options.
 */
export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const { resetMs = 2000, successMessage, errorMessage } = options;
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleReset = useCallback(
    (id: string | null) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        setCopiedId(null);
      }, resetMs);
    },
    [resetMs],
  );

  const writeToClipboard = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        if (successMessage) toast.success(successMessage);
        return true;
      } catch {
        if (errorMessage) toast.error(errorMessage);
        return false;
      }
    },
    [successMessage, errorMessage],
  );

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await writeToClipboard(text);
      if (ok) {
        setCopied(true);
        scheduleReset(null);
      }
      return ok;
    },
    [writeToClipboard, scheduleReset],
  );

  const copyWithId = useCallback(
    async (text: string, id: string): Promise<boolean> => {
      const ok = await writeToClipboard(text);
      if (ok) {
        setCopiedId(id);
        scheduleReset(id);
      }
      return ok;
    },
    [writeToClipboard, scheduleReset],
  );

  return { copied, copiedId, copy, copyWithId };
}
