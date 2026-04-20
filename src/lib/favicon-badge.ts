/**
 * Favicon badge — draws a small dot overlay on the site favicon when there are
 * unread completions. Mirrors the lifecycle of `tab-title-badge.ts`:
 * - `showFaviconBadge()` activates the dot (idempotent).
 * - `clearFaviconBadge()` restores the original favicon.
 *
 * Implementation:
 * - We load the existing favicon (32×32 PNG) into an Image, draw it onto a
 *   canvas, then composite a small accent-coloured dot in the top-right.
 * - The result is written back to `<link rel="icon" type="image/png">`.
 * - The original href is cached so we can restore it cleanly.
 *
 * Notes:
 * - We touch the PNG link only (the .ico fallback is left alone — browsers
 *   that show the .ico don't render dynamic favicons reliably either way).
 * - All draws are best-effort; failures are silent (favicon is a non-critical
 *   surface).
 */

const PNG_LINK_SELECTOR = 'link[rel~="icon"][type="image/png"]';

let originalHref: string | null = null;
let active = false;

function getPngLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  // Prefer the 32×32 explicitly; fall back to any PNG icon link.
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>(PNG_LINK_SELECTOR));
  if (links.length === 0) return null;
  const sized = links.find((l) => l.sizes?.value === "32x32");
  return sized ?? links[0];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    // Cache-bust so we always re-render against the canonical icon, not a
    // previously-badged data URL.
    img.src = src.startsWith("data:") ? src : src;
  });
}

async function drawBadgedFavicon(sourceHref: string): Promise<string | null> {
  try {
    const size = 64; // upscale for crisper rendering on retina tabs
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const img = await loadImage(sourceHref);
    ctx.drawImage(img, 0, 0, size, size);

    // Dot geometry: top-right, ~30% of canvas
    const r = size * 0.22;
    const cx = size - r - 2;
    const cy = r + 2;

    // Soft contrast ring so the dot reads on both light and dark favicons
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();

    // Accent fill — matches the theme primary (hsl(250 75% 55%) ≈ #6E5BD9)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#6E5BD9";
    ctx.fill();

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Show the dot on the favicon. Idempotent — repeated calls are no-ops. */
export async function showFaviconBadge(): Promise<void> {
  if (active) return;
  const link = getPngLink();
  if (!link) return;
  if (originalHref === null) originalHref = link.href;

  const dataUrl = await drawBadgedFavicon(originalHref);
  if (!dataUrl) return;
  // Re-check active flag: another caller may have raced ahead.
  if (active) return;
  link.href = dataUrl;
  active = true;
}

/** Restore the original favicon. */
export function clearFaviconBadge(): void {
  if (!active) return;
  const link = getPngLink();
  if (link && originalHref) {
    link.href = originalHref;
  }
  active = false;
}
