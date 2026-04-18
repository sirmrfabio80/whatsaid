import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type TocItem = { id: string; label: string };

interface HelpTOCProps {
  items: TocItem[];
}

export default function HelpTOC({ items }: HelpTOCProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${id}`);
    }
  };

  return (
    <>
      {/* Mobile: horizontal chip nav */}
      <nav
        aria-label="Help sections"
        className="lg:hidden -mx-5 sm:-mx-6 px-5 sm:px-6 overflow-x-auto sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border/60"
      >
        <ul className="flex gap-2 py-3 whitespace-nowrap">
          {items.map((it) => (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                onClick={(e) => handleClick(e, it.id)}
                className={cn(
                  "inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  activeId === it.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border hover:text-foreground",
                )}
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop: sticky vertical TOC */}
      <nav
        aria-label="Help sections"
        className="hidden lg:block sticky top-24 self-start"
      >
        <ul className="space-y-1 text-sm">
          {items.map((it) => (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                onClick={(e) => handleClick(e, it.id)}
                className={cn(
                  "block py-1.5 px-3 rounded-lg border-l-2 transition-colors",
                  activeId === it.id
                    ? "border-primary text-foreground font-medium bg-muted/40"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
