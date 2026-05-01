/**
 * Tiny IndexedDB wrapper for persisting MediaRecorder chunks during a
 * recording session. Keeps memory flat for long recordings and lets us
 * survive accidental reloads.
 *
 * Schema: one object store "chunks", keyPath = "id" where
 *   id = `${sessionId}::${chunkIndex}` (zero-padded so lexical order = numeric)
 *
 * We don't expose chunkIndex publicly — callers just append blobs and ask
 * for "all chunks for session X in order".
 */

const DB_NAME = "whatsaid-recorder";
const DB_VERSION = 1;
const STORE = "chunks";

interface ChunkRow {
  id: string;
  sessionId: string;
  index: number;
  blob: Blob;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open recorder DB"));
  });
  return dbPromise;
}

function padIndex(i: number): string {
  return i.toString().padStart(8, "0");
}

export async function appendChunk(
  sessionId: string,
  index: number,
  blob: Blob,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const row: ChunkRow = {
      id: `${sessionId}::${padIndex(index)}`,
      sessionId,
      index,
      blob,
      createdAt: Date.now(),
    };
    tx.objectStore(STORE).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Chunk write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Chunk write aborted"));
  });
}

export async function readAllChunks(sessionId: string): Promise<Blob[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const idx = store.index("sessionId");
    const req = idx.getAll(IDBKeyRange.only(sessionId));
    req.onsuccess = () => {
      const rows = (req.result as ChunkRow[]) ?? [];
      rows.sort((a, b) => a.index - b.index);
      resolve(rows.map((r) => r.blob));
    };
    req.onerror = () => reject(req.error ?? new Error("Chunk read failed"));
  });
}

export async function clearSession(sessionId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const idx = store.index("sessionId");
    const req = idx.openCursor(IDBKeyRange.only(sessionId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Chunk clear failed"));
  });
}

/** Best-effort cleanup of any stray sessions older than `maxAgeMs`. */
export async function purgeStaleChunks(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const db = await openDb();
    const cutoff = Date.now() - maxAgeMs;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const row = cursor.value as ChunkRow;
        if (row.createdAt < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Best-effort only
  }
}
