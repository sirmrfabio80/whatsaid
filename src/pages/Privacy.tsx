import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground mb-6" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" />Back to home</Link>
          </Button>

          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

          <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">1. Who we are</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                WhatSaid ("we", "us", "our") provides an AI-powered audio transcription and analysis service. This policy explains how we collect, use, and protect your information.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">2. What we collect</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li><strong>Account data:</strong> email address, display name (when you create an account)</li>
                <li><strong>Audio files:</strong> uploaded temporarily for processing only</li>
                <li><strong>Transcripts and outputs:</strong> generated text, summaries, and custom AI analysis</li>
                <li><strong>Payment metadata:</strong> Stripe session and transaction references (we never see or store card numbers)</li>
                <li><strong>Usage data:</strong> job history, credit balances, and language preferences</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">3. How we use your data</h2>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li>To process your audio and deliver transcripts, summaries, and custom outputs</li>
                <li>To manage your account, credits, and billing</li>
                <li>To improve service reliability and prevent abuse</li>
              </ul>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">4. Audio retention and deletion</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong>Audio files are deleted immediately after processing.</strong> We do not retain, archive, or replay your original audio. Only the generated text outputs (transcript, summary, custom output) and associated job metadata are stored.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">5. Transcript and output retention</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                For <strong>account holders</strong>, transcripts and outputs are retained until you delete your account.
                For <strong>guest users</strong>, results are retained for 30 days and then automatically deleted.
                You may request deletion of your data at any time.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">6. Third-party processors</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We use the following third-party services to deliver WhatSaid:
              </p>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
                <li><strong>AssemblyAI</strong> — speech-to-text transcription (audio is transmitted securely and processed in the US)</li>
                <li><strong>Stripe</strong> — payment processing</li>
                <li><strong>Cloud hosting provider</strong> — database, authentication, and file storage</li>
              </ul>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                Your audio may be transferred internationally for processing. We rely on appropriate safeguards as required by applicable data protection laws.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">7. Your rights</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Depending on your jurisdiction, you may have the right to access, correct, delete, or export your personal data, and to object to or restrict processing. To exercise any of these rights, please contact us.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">8. Cookies and tracking</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                WhatSaid does not currently use analytics cookies or third-party tracking. We use only essential session cookies required for authentication.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">9. Children</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                WhatSaid is not intended for use by individuals under 18. We do not knowingly collect data from minors.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">10. Changes to this policy</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We may update this policy from time to time. Material changes will be communicated via the service or email for account holders.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-lg font-semibold mb-2">11. Contact</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                For privacy-related enquiries or data requests, please contact us at the email address provided in the application.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
