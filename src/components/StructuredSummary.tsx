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

  return sections.filter((s) => s.body.length > 0);
}

function renderLine(line: string): ReactNode {
  // Bold: **text**
  const parts: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length > 0 ? parts : line;
}

function SectionBody({ body }: { body: string }) {
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
      <div className="space-y-2">
        {proseLines.length > 0 && (
          <p className="text-sm leading-relaxed text-foreground/90">
            {renderLine(proseLines.join(" "))}
          </p>
        )}
        <ul className="space-y-1.5 list-disc list-outside pl-4 marker:text-primary/40">
          {bullets.map((b, i) => (
            <li key={i} className="text-sm leading-relaxed text-foreground/90">
              {renderLine(b)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm leading-relaxed text-foreground/90">
          {renderLine(line)}
        </p>
      ))}
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
    <div className="space-y-5" role="region" aria-label="Summary sections">
      {sections.map((section, i) => (
        <section key={i} aria-labelledby={section.heading ? `summary-section-${i}` : undefined}>
          {section.heading && (
            <div className="flex items-center gap-2 mb-2">
              {section.icon}
              <h3
                id={`summary-section-${i}`}
                className="text-sm font-semibold tracking-tight"
              >
                {section.heading}
              </h3>
            </div>
          )}
          <div className={section.heading ? "pl-6" : ""}>
            <SectionBody body={section.body} />
          </div>
          {i < sections.length - 1 && (
            <div className="border-b border-border/30 mt-5" />
          )}
        </section>
      ))}
    </div>
  );
}
