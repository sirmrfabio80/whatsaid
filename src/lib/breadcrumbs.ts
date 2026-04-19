/**
 * Build a schema.org BreadcrumbList JSON-LD object.
 * Always prepends Home; pass remaining trail items in order.
 */
export function buildBreadcrumbList(
  trail: { name: string; path: string }[],
): Record<string, unknown> {
  const SITE = "https://whatsaid.app";
  const items = [{ name: "Home", path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: `${SITE}${item.path === "/" ? "/" : item.path}`,
    })),
  };
}
