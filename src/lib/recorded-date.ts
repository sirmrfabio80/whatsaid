/**
 * Deterministic parsing and formatting of ISO 8601 date strings
 * that preserves the original recording wall-clock time and offset.
 *
 * This avoids browser-local Date shifts entirely.
 */

interface ParsedRecordedAt {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  offsetMinutes: number | null; // original offset in minutes, null if unknown
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:([+-])(\d{2}):?(\d{2})?|Z)?/;

/**
 * Parse an ISO 8601 string and return the wall-clock components
 * as they were in the *original offset* (not in browser-local time).
 *
 * If the string has an offset (e.g. +01:00) the returned values are
 * in that offset's local time — exactly what was recorded.
 *
 * If the string ends with Z (UTC) the returned values are in UTC.
 */
export function parseRecordedAt(iso: string): ParsedRecordedAt | null {
  const m = ISO_RE.exec(iso);
  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
    offsetMinutes:
      m[7] != null
        ? (m[7] === "+" ? 1 : -1) * (Number(m[8]) * 60 + Number(m[9] ?? 0))
        : m[0].endsWith("Z")
          ? 0
          : null,
    // Note: m[9] may be undefined for short offsets like "+00" — default to 0
  };
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a recorded-at ISO string as a short date: "13 Mar 2026"
 */
export function formatRecordedDate(iso: string): string {
  const p = parseRecordedAt(iso);
  if (!p) return iso;
  return `${p.day} ${MONTHS_SHORT[p.month - 1]} ${p.year}`;
}

/**
 * Format a recorded-at ISO string as time: "10:49"
 */
export function formatRecordedTime(iso: string): string {
  const p = parseRecordedAt(iso);
  if (!p) return "";
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/**
 * Build an ISO string from date + time components, preserving the given offset.
 * If offsetMinutes is null, no offset suffix is appended (treated as local).
 */
export function buildIsoString(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
  offsetMinutes: number | null,
): string {
  const base = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
  if (offsetMinutes === null) return base;
  if (offsetMinutes === 0) return base + "Z";
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${base}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Convert a parsed recorded-at back to a Date for calendar widget,
 * creating a Date whose local components match the recorded wall-clock.
 */
export function toLocalDate(iso: string): Date {
  const p = parseRecordedAt(iso);
  if (!p) return new Date(iso);
  // Create a local Date with the wall-clock values (ignoring the offset)
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/**
 * Given an existing ISO string and a new calendar date selection,
 * keep the time and offset from the original and replace only the date.
 */
export function replaceDate(existingIso: string, newYear: number, newMonth: number, newDay: number): string {
  const p = parseRecordedAt(existingIso);
  if (!p) return existingIso;
  return buildIsoString(newYear, newMonth, newDay, p.hour, p.minute, p.second, p.offsetMinutes);
}

/**
 * Given an existing ISO string and new hour/minute, keep the date and offset.
 */
export function replaceTime(existingIso: string, newHour: number, newMinute: number): string {
  const p = parseRecordedAt(existingIso);
  if (!p) return existingIso;
  return buildIsoString(p.year, p.month, p.day, newHour, newMinute, p.second, p.offsetMinutes);
}
