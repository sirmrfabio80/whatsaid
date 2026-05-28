import { Link } from "react-router-dom";
import { Fragment, type ReactNode } from "react";

const ICO_URL_BY_TOKEN: Record<string, string> = {
  // Default ICO link target. Section 12 (Privacy) overrides to the lawful-basis
  // page where it makes sense — keep this URL generic.
  icoLink: "https://ico.org.uk/",
};

const INTERNAL_LINKS: Record<string, string> = {
  privacyLink: "/privacy",
  termsLink: "/terms",
  cookiesLink: "/cookies",
  refundLink: "/refund-policy",
  settingsLink: "/settings",
};

const ALL_TOKENS = [
  "privacyLink",
  "termsLink",
  "cookiesLink",
  "refundLink",
  "settingsLink",
  "icoLink",
];

type Segment = { type: "text"; value: string } | { type: "link"; token: string; label: string };

function tokenize(text: string): Segment[] {
  const pattern = new RegExp(`<(${ALL_TOKENS.join("|")})>([\\s\\S]*?)</\\1>`, "g");
  const out: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      out.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    out.push({ type: "link", token: match[1], label: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ type: "text", value: text.slice(lastIndex) });
  }
  return out;
}

export function PolicyRichText({ text }: { text: string }): ReactNode {
  const segs = tokenize(text);
  return (
    <>
      {segs.map((seg, i) => {
        if (seg.type === "text") return <Fragment key={i}>{seg.value}</Fragment>;
        const className = "underline hover:text-foreground";
        if (seg.token in INTERNAL_LINKS) {
          return (
            <Link key={i} to={INTERNAL_LINKS[seg.token]} className={className}>
              {seg.label}
            </Link>
          );
        }
        return (
          <a
            key={i}
            href={ICO_URL_BY_TOKEN[seg.token] ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
          >
            {seg.label}
          </a>
        );
      })}
    </>
  );
}
