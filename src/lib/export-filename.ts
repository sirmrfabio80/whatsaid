interface ExportNameInput {
  jobTitle?: string | null;
  generatedTitle?: string | null;
  originalFileName?: string | null;
}

function normalizeCandidate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function stripExtension(fileName: string | null | undefined): string | null {
  const normalized = normalizeCandidate(fileName);
  if (!normalized) return null;

  const withoutExtension = normalized.replace(/\.[^.]+$/, "").trim();
  return withoutExtension || normalized;
}

export function sanitizeFileBaseName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();

  return sanitized || "WhatSaid-export";
}

export function resolveExportBaseName({
  jobTitle,
  generatedTitle,
  originalFileName,
}: ExportNameInput): string {
  const candidate =
    normalizeCandidate(jobTitle) ??
    normalizeCandidate(generatedTitle) ??
    stripExtension(originalFileName) ??
    "WhatSaid-export";

  return sanitizeFileBaseName(candidate);
}