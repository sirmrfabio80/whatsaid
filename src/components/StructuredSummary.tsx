import { FileText, ListChecks, ArrowRight, BookOpen } from "lucide-react";
import type { ReactNode } from "react";

interface StructuredSummaryProps {
  content: string;
}

interface SummarySection {
  heading: string;
  body: string;
  icon: ReactNode;
}

const SECTION_ICONS: Record<string, ReactNode> = {
  "overview": <FileText className="w-4 h-4 text-primary" />,
  "panoramica": <FileText className="w-4 h-4 text-primary" />,
  "key points": <ListChecks className="w-4 h-4 text-primary" />,
  "punti chiave": <ListChecks className="w-4 h-4 text-primary" />,
  "decisions & next steps": <ArrowRight className="w-4 h-4 text-primary" />,
  "decisions and next steps": <ArrowRight className="w-4 h-4 text-primary" />,
  "decisioni e prossimi passi": <ArrowRight className="w-4 h-4 text-primary" />,
  "terms to know": <BookOpen className="w-4 h-4 text-primary" />,
  "termini da conoscere": <BookOpen className="w-4 h-4 text-primary" />,
};

function getIcon(heading: string): ReactNode {
  const key = heading.toLowerCase().replace(/^#+\s*/, "").trim();
  return SECTION_ICONS[key] ?? <FileText className="w-4 h-4 text-primary" />;
}

function parseSections(content: string): SummarySection[] {
  const lines = content.split("\n");
  const sections: SummarySection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentHeading || currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentLines.join("\n").trim(),
          icon: getIcon(currentHeading),
        });
      }
      currentHeading = headingMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentHeading || currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentLines.join("\n").trim(),
      icon: getIcon(currentHeading),
    });
  }

  return sections.filter((s) => s.body.length > 0 && s.heading.length > 0);
}

function stripHeading(line: string): { text: string; isHeading: boolean } {
  const match = line.match(/^#{1,4}\s+(.*)/);
  if (match) return { text: match[1], isHeading: true };
  return { text: line, isHeading: false };
}

function renderLine(line: string): ReactNode {
  // Order matters: bold+italic (***) before bold (**) before italic (*)
  const regex = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      // Bold + Italic
      parts.push(<strong key={key++}><em>{match[1]}</em></strong>);
    } else if (match[2] !== undefined) {
      // Bold
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      // Italic
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      // Inline code
      parts.push(
        <code key={key++} className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground/80">
          {match[4]}
        </code>
      );
    } else if (match[5] !== undefined) {
      // Link
      parts.push(
        <a key={key++} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary">
          {match[5]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length > 0 ? parts : line;
}

export function SectionBody({ body }: { body: string }) {
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  const bulletLines = lines.filter((l) => /^\s*[-*]\s/.test(l));
  const isBulletList = bulletLines.length > 0 && bulletLines.length >= lines.length * 0.5;

  if (isBulletList) {
    const proseLines: string[] = [];
    const bullets: string[] = [];
    let inBullets = false;

    for (const line of lines) {
      if (/^\s*[-*]\s/.test(line)) {
        inBullets = true;
        bullets.push(line.replace(/^\s*[-*]\s+/, ""));
      } else if (!inBullets) {
        proseLines.push(line);
      } else {
        if (bullets.length > 0) {
          bullets[bullets.length - 1] += " " + line.trim();
        }
      }
    }

    return (
      <div className="space-y-3 font-serif">
        {proseLines.length > 0 && (
          <p className="text-base leading-[1.7] text-foreground/90">
            {renderLine(proseLines.join(" "))}
          </p>
        )}
        <ul className="space-y-2.5 list-disc list-outside pl-4 marker:text-primary/40">
          {bullets.map((b, i) => {
            const { text, isHeading } = stripHeading(b);
            return (
              <li key={i} className={`text-base leading-[1.7] text-foreground/90 ${isHeading ? "font-semibold" : ""}`}>
                {renderLine(text)}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3 font-serif">
      {lines.map((line, i) => {
        const { text, isHeading } = stripHeading(line);
        return (
          <p key={i} className={`text-base leading-[1.7] text-foreground/90 ${isHeading ? "font-semibold" : ""}`}>
            {renderLine(text)}
          </p>
        );
      })}
    </div>
  );
}

export default function StructuredSummary({ content }: StructuredSummaryProps) {
  const sections = parseSections(content);

  // Fallback for old-format summaries without ## headings
  if (sections.length <= 1 && !sections[0]?.heading) {
    return (
      <div className="space-y-2">
        {content.split("\n").filter(l => l.trim()).map((line, i) => (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">
            {renderLine(line)}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6" role="region" aria-label="Summary sections">
      {sections.map((section, i) => (
        <section
          key={i}
          aria-labelledby={section.heading ? `summary-section-${i}` : undefined}
          className="rounded-xl bg-muted/40 p-4 sm:p-5"
        >
          {section.heading && (
            <div className="flex items-center gap-2 mb-3">
              {section.icon}
              <h3
                id={`summary-section-${i}`}
                className="font-serif text-[17px] sm:text-[18px] font-semibold tracking-tight"
              >
                {section.heading}
              </h3>
            </div>
          )}
          <div className={section.heading ? "pl-0 sm:pl-6" : ""}>
            <SectionBody body={section.body} />
          </div>
        </section>
      ))}
    </div>
  );
}
