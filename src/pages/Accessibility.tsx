import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/hooks/use-page-meta";
import { LegalEnglishOnlyBanner } from "@/components/policy/LegalEnglishOnlyBanner";
// Effective / last-reviewed date for the current version of this statement.
// Update on every material change. Format: "DD Month YYYY".
const LAST_REVIEWED = "28 May 2026";
const LAST_TESTED = "28 May 2026";

export default function Accessibility() {
  usePageMeta({
    title: "Accessibility Statement — WhatSaid",
    description:
      "WhatSaid's accessibility statement: WCAG 2.2 AA target, known issues, reasonable adjustments under the Equality Act 2010, and how to contact us.",
    canonical: "https://whatsaid.app/accessibility",
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter-flat">
      <div className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 text-muted-foreground mb-6"
            asChild
          >
            <Link to="/">
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
          </Button>

          <h1 className="text-h1 sm:text-[1.875rem] tracking-tight mb-2">
            Accessibility statement for WhatSaid
          </h1>
          <p className="text-body-sm text-muted-foreground mb-8">
            Last reviewed: {LAST_REVIEWED}
          </p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                WhatSaid is operated by Fabio Petito, trading as WhatSaid. We
                want as many people as possible to be able to use this website
                and the WhatSaid web application. We are committed to making our
                service accessible in line with the{" "}
                <a
                  href="https://www.w3.org/TR/WCAG22/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Web Content Accessibility Guidelines (WCAG) 2.2
                </a>{" "}
                at Level AA, and with our duties under the Equality Act 2010 to
                make reasonable adjustments for disabled users.
              </p>
            </section>

            <section>
              <h2 className="text-h2 mb-2">1. What this statement covers</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                This statement applies to content published at{" "}
                <strong>whatsaid.app</strong>, including the marketing pages,
                the signed-in WhatSaid application (uploader, transcript
                viewer, settings, history, admin) and the policy pages. It does
                not cover third-party content we link to, such as the Paddle
                checkout, the ICO website, or other external sites.
              </p>
            </section>

            <section>
              <h2 className="text-h2 mb-2">2. How accessible WhatSaid is</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                We aim to meet WCAG 2.2 Level AA. As a small team we test
                regularly and fix issues as we find them. The known gaps below
                are tracked and prioritised.
              </p>
              <h3 className="text-h3 mt-4 mb-1">Things you should be able to do</h3>
              <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li>Navigate the whole app using a keyboard.</li>
                <li>
                  Use the app with a screen reader (we test with VoiceOver on
                  macOS/iOS and NVDA on Windows).
                </li>
                <li>Zoom the page up to 200% without content being lost.</li>
                <li>
                  Use the app in your system's dark or light theme — both are
                  supported with sufficient colour contrast.
                </li>
                <li>
                  Use the app with reduced motion enabled — non-essential
                  animation is suppressed.
                </li>
                <li>
                  Switch the interface language between English, Italian and
                  French.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-h2 mb-2">3. Known issues</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                We are aware of the following areas where our service may not
                fully meet WCAG 2.2 AA. We are working on fixes and will update
                this statement when each is resolved.
              </p>
              <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1 mt-2">
                <li>
                  A small number of icon-only buttons in advanced views may not
                  yet expose a descriptive accessible name on every interaction
                  state.
                </li>
                <li>
                  Some long generated transcripts are presented as plain text;
                  we do not yet provide synchronised audio playback for users
                  who prefer that mode.
                </li>
                <li>
                  Speaker labels in transcripts rely on AI inference and may be
                  approximate; this is a content limitation rather than a code
                  defect.
                </li>
                <li>
                  Third-party checkout (Paddle) is outside our direct control;
                  Paddle publish their own accessibility information.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-h2 mb-2">
                4. Reasonable adjustments and how to ask for help
              </h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                Under the Equality Act 2010 we have a duty to make reasonable
                adjustments so that disabled people are not put at a
                substantial disadvantage. If you cannot access part of the
                service, or you need information in a different format such as
                large print, plain text email, or a different colour scheme,
                please email{" "}
                <a
                  href="mailto:support@whatsaid.app"
                  className="underline hover:text-foreground"
                >
                  support@whatsaid.app
                </a>{" "}
                and tell us:
              </p>
              <ul className="text-body-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1 mt-2">
                <li>the web address or screen where the problem is;</li>
                <li>what you were trying to do;</li>
                <li>
                  what assistive technology, browser or device you are using
                  (if you are happy to share that).
                </li>
              </ul>
              <p className="text-body-sm text-muted-foreground leading-relaxed mt-2">
                We aim to acknowledge your message within 2 working days and to
                respond substantively within 10 working days.
              </p>
            </section>

            <section>
              <h2 className="text-h2 mb-2">5. Reporting accessibility problems</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                We always want to hear about accessibility problems even if you
                do not need an immediate adjustment. Email{" "}
                <a
                  href="mailto:support@whatsaid.app"
                  className="underline hover:text-foreground"
                >
                  support@whatsaid.app
                </a>{" "}
                with the details. Your feedback helps us prioritise fixes for
                everyone.
              </p>
            </section>

            <section>
              <h2 className="text-h2 mb-2">6. Enforcement procedure</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                If you contact us with an accessibility problem and you are not
                happy with how we respond, you can contact the Equality
                Advisory and Support Service (EASS), the statutory body that
                handles Equality Act 2010 complaints in England, Scotland and
                Wales:{" "}
                <a
                  href="https://www.equalityadvisoryservice.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  equalityadvisoryservice.com
                </a>
                . In Northern Ireland the equivalent body is the{" "}
                <a
                  href="https://www.equalityni.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Equality Commission for Northern Ireland
                </a>
                . As a private-sector service WhatSaid is not in scope of the
                Public Sector Bodies (Websites and Mobile Applications)
                Accessibility Regulations 2018; we publish this statement
                voluntarily because we think it is the right thing to do.
              </p>
            </section>

            <section>
              <h2 className="text-h2 mb-2">7. Technical information</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                WhatSaid is partially compliant with the{" "}
                <a
                  href="https://www.w3.org/TR/WCAG22/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Web Content Accessibility Guidelines version 2.2
                </a>{" "}
                AA standard, because of the known issues listed in section 3.
                Our preferred conformance target is full Level AA.
              </p>
              <p className="text-body-sm text-muted-foreground leading-relaxed mt-2">
                The app is built with React, Tailwind CSS and shadcn/ui
                primitives (which wrap accessible Radix UI components). We use
                semantic HTML, a single <code>&lt;main&gt;</code> landmark per
                page, design tokens with WCAG-AA contrast in both light and
                dark themes, and we honour the user's{" "}
                <code>prefers-reduced-motion</code> and{" "}
                <code>prefers-color-scheme</code> system settings.
              </p>
            </section>

            <section>
              <h2 className="text-h2 mb-2">8. How we test</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                We last carried out a manual accessibility review of the
                signed-in product, the marketing pages and the policy pages on{" "}
                {LAST_TESTED}. The review combined keyboard navigation, screen
                reader spot-checks (VoiceOver, NVDA), automated checks (axe
                DevTools, Lighthouse) and a code audit for icon-only buttons,
                form labels, landmark structure, focus order, focus visibility
                and colour contrast. We test at least once per quarter and
                whenever we ship a substantial change.
              </p>
            </section>

            <section>
              <h2 className="text-h2 mb-2">9. Updates to this statement</h2>
              <p className="text-body-sm text-muted-foreground leading-relaxed">
                We will update this statement whenever we resolve a known issue
                or discover a new one, and at least once a year. The
                "last reviewed" date at the top of this page shows when it was
                last checked.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
