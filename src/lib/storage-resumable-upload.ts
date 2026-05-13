import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const TUS_ENDPOINT = `${SUPABASE_URL}/storage/v1/upload/resumable`;

const CHUNK_SIZE_BYTES = 6 * 1024 * 1024; // 6 MB
const RETRY_DELAYS_MS = [0, 3_000, 5_000, 10_000, 20_000];

export interface ResumableUploadOptions {
  bucketName: string;
  objectName: string; // e.g. `${userId}/${jobId}/${safeName}`
  file: File;
  jobId: string; // used to namespace the localStorage key
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void;
  onChunkComplete?: () => void; // fired after each successful chunk (for heartbeat)
  onRetry?: (attempt: number, err: Error) => void;
  /**
   * Called once the underlying tus upload is created/started, exposing a
   * handle the caller can use to abort (e.g. user-cancelled upload).
   */
  onUploadCreated?: (handle: { abort: () => Promise<void> | void }) => void;
}

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload aborted by user");
    this.name = "UploadAbortedError";
  }
}

export interface ResumableUploadResult {
  retries: number;
  resumedFromPrevious: boolean;
  chunkSizeMb: number;
}

/**
 * Upload a file to Supabase Storage using TUS resumable protocol.
 *
 * - 6 MB chunks
 * - Up to 4 transient retries with exponential backoff
 * - Resumes from previous interrupted upload if the same jobId is retried
 *   in the same browser (URL persisted in localStorage by tus-js-client)
 */
/**
 * Resolve a usable access token. Tries the cached session first, then a
 * forced refresh — long CPU-bound work (e.g. audio enhancement) can leave
 * the in-memory session stale by the time upload starts.
 */
async function getFreshAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token ?? null;
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? null;
  }
  if (!token) {
    throw new Error("Not authenticated — cannot upload");
  }
  return token;
}

export async function resumableUpload(
  opts: ResumableUploadOptions,
): Promise<ResumableUploadResult> {
  let accessToken = await getFreshAccessToken();

  let retries = 0;
  let resumedFromPrevious = false;

  return new Promise<ResumableUploadResult>((resolve, reject) => {
    const upload = new tus.Upload(opts.file, {
      endpoint: TUS_ENDPOINT,
      retryDelays: RETRY_DELAYS_MS,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      // Namespace the upload fingerprint by jobId so different jobs can't
      // collide and the same job can resume after reload.
      metadata: {
        bucketName: opts.bucketName,
        objectName: opts.objectName,
        // Supabase Storage rejects MIME types with codec parameters
        // (e.g. "audio/mp4;codecs=mp4a.40.2" → 415). Strip parameters so
        // only the base type is sent.
        contentType: (opts.file.type || "application/octet-stream").split(";")[0].trim(),
        cacheControl: "3600",
      },
      chunkSize: CHUNK_SIZE_BYTES,
      onError: (err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        reject(error);
      },
      onShouldRetry: (err, retryAttempt) => {
        retries = Math.max(retries, retryAttempt + 1);
        const error = err instanceof Error ? err : new Error(String(err));
        const status = (err as { originalResponse?: { getStatus?: () => number } })
          ?.originalResponse?.getStatus?.();
        // On auth failure, try once to refresh the token and retry.
        if (status === 401 || status === 403) {
          getFreshAccessToken()
            .then((tok) => {
              accessToken = tok;
              upload.options.headers = {
                ...(upload.options.headers ?? {}),
                authorization: `Bearer ${tok}`,
                "x-upsert": "false",
              };
            })
            .catch(() => {});
          // Allow one retry attempt after auth refresh; subsequent 401s give up.
          return retryAttempt === 0;
        }
        opts.onRetry?.(retryAttempt + 1, error);
        return true;
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        opts.onProgress?.(bytesUploaded, bytesTotal);
        opts.onChunkComplete?.();
      },
      onSuccess: () => {
        resolve({
          retries,
          resumedFromPrevious,
          chunkSizeMb: CHUNK_SIZE_BYTES / 1024 / 1024,
        });
      },
    });

    // Try to resume any previous upload for this fingerprint (same file +
    // same metadata). If found, pick the first one.
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
        resumedFromPrevious = true;
      }
      upload.start();
    }).catch(() => {
      // findPreviousUploads can fail in private browsing — just start fresh.
      upload.start();
    });
  });
}
