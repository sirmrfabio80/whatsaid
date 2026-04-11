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
  "key points": <ListChecks className="w-4 h-4 text-primary" />,
  "decisions & next steps": <ArrowRight className="w-4 h-4 text-primary" />,
  "decisions and next steps": <ArrowRight className="w-4 h-4 text-primary" />,
  "terms to know": <BookOpen className="w-4 h-4 text-primary" />,
};

function getIcon(heading: string): ReactNode {
  const key = heading.toLowerCase().replace(/^#+\s*/, "").trim();
  return SECTION_ICONS[key] ?? <FileText className="w-4 h-4 text-primary" />;
}

/** Parse markdown with ## headings into sections */
function parseSections(content: string): SummarySection[] {
  const lines = content.split("\n");
  const sections: SummarySection[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
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

  // Save last section
  if (currentHeading || currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentLines.join("\n").trim(),
      icon: getIcon(currentHeading),
    });
  }

  return sections.filter((s) => s.body.length > 0);
}

/** Render a bullet line, stripping the leading `- ` */
function BulletItem({ text }: { text: string }) {
  return (
    <li className="text-sm leading-relaxed text-foreground/90">
      {text}
    </li>
  );
}

/** Render section body: detect bullet lists vs prose */
function SectionBody({ body }: { body: string }) {
  const lines = body.split("\n").filter((l) => l.trim().length > 0);

  // Check if mostly bullets
  const bulletLines = lines.filter((l) => /^\s*[-*]\s/.test(l));
  const isBulletList = bulletLines.length > 0 && bulletLines.length >= lines.length * 0.5;

  if (isBulletList) {
    // Split into prose lines before bullets and bullet items
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
        // Continuation of previous bullet
        if (bullets.length > 0) {
          bullets[bullets.length - 1] += " " + line.trim();
        }
      }
    }

    return (
      <div className="space-y-2">
        {proseLines.length > 0 && (
          <p className="text-sm leading-relaxed text-foreground/90">
            {proseLines.join(" ")}
          </p>
        )}
        <ul className="space-y-1.5 list-disc list-outside pl-4 marker:text-primary/40">
          {bullets.map((b, i) => (
            <BulletItem key={i} text={b} />
          ))}
        </ul>
      </div>
    );
  }

  // Prose paragraphs
  return (
    <div className="space-y-2">
      {lines.map((line, i) => (
        <p key={i} className="text-sm leading-relaxed text-foreground/90">
          {line}
        </p>
      ))}
    </div>
  );
}

export default function StructuredSummary({ content }: StructuredSummaryProps) {
  const sections = parseSections(content);

  // Fallback: if no sections were parsed (old-format summary), render as prose
  if (sections.length <= 1 && !sections[0]?.heading) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
        {content}
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
