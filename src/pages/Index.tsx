import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CREDIT_PACKS } from "@/lib/pricing";
import {
  Mic, Sparkles, FileText, Users, ArrowRight, Zap, Shield, Clock,
  Upload, Cpu, Download, Globe, ListChecks, MessageSquareText
} from "lucide-react";

export default function Index() {
  const { user, creditBalance } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/2 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 py-20 sm:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              AI transcription + speaker labels
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1]">
              Know exactly what was{" "}
              <span className="text-primary">said</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
              Upload any audio file and get a full transcript with speaker labels, a summary, key actions, and custom AI analysis — in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button size="lg" className="h-12 px-8 text-base font-medium rounded-xl" onClick={() => navigate("/convert")}>
                Convert your audio
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base rounded-xl" asChild>
                <a href="#pricing">See pricing</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border/50 bg-muted/30">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <span>99 languages supported</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span>Speaker identification</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span>Audio deleted after processing</span>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">How it works</h2>
          <p className="text-muted-foreground max-w-md mx-auto">Three steps. No account required for one-off conversions.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
          {[
            { step: "1", icon: Upload, title: "Upload", desc: "Drag and drop your .m4a, .mp3, or .wav file. We detect the duration and language automatically." },
            { step: "2", icon: Cpu, title: "We process", desc: "AI transcribes with speaker labels, generates a summary, key actions, and your custom analysis." },
            { step: "3", icon: Download, title: "Download", desc: "View results instantly. Download as text or JSON. Your audio is deleted immediately." },
          ].map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <div className="text-xs font-medium text-primary mb-1">Step {step}</div>
              <h3 className="font-heading font-semibold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="bg-muted/30 border-y border-border/50">
        <div className="container mx-auto px-4 py-16 sm:py-24">
          <div className="text-center mb-12">
            <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">Everything you need</h2>
            <p className="text-muted-foreground max-w-md mx-auto">One upload, three outputs — plus custom AI analysis from your own prompt.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Users, title: "Speaker identification", desc: "Know who said what with automatic speaker labels and diarization." },
              { icon: FileText, title: "Three outputs per file", desc: "Full transcript, smart summary with key actions, and custom AI analysis from your prompt." },
              { icon: Globe, title: "99 languages", desc: "Auto-detects the spoken language — or manually select one before processing." },
              { icon: Shield, title: "Audio deleted after processing", desc: "Your audio is never stored. Files are deleted immediately after transcription." },
              { icon: Clock, title: "Pay as you go", desc: "No subscription. Pay per job as a guest, or buy credit packs for volume discounts." },
              { icon: MessageSquareText, title: "Custom AI prompts", desc: "Ask anything about your transcript — extract quotes, action items, decisions, or anything else." },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="rounded-xl border-border/50 hover:border-primary/20 transition-all hover:shadow-md bg-card">
                <CardContent className="p-5 sm:p-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-heading font-semibold text-lg mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container mx-auto px-4 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">Simple, transparent pricing</h2>
          <p className="text-muted-foreground max-w-md mx-auto">Pay once per conversion — no subscription. Save up to 50% with credit packs.</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Guest pricing */}
          <Card className="rounded-xl border-border/50 bg-card">
            <CardContent className="p-6 sm:p-8">
              <h3 className="font-heading font-semibold text-lg mb-1">One-off conversion</h3>
              <p className="text-sm text-muted-foreground mb-6">No account required. Pay and convert instantly.</p>
              <div className="space-y-3 mb-6">
                {[
                  { label: "Up to 15 minutes", price: "$2.99" },
                  { label: "15–30 minutes", price: "$4.99" },
                  { label: "30–60 minutes", price: "$7.99" },
                ].map(({ label, price }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm">{label}</span>
                    <span className="font-heading font-semibold">{price}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full h-11 rounded-xl" onClick={() => navigate("/convert")}>
                Convert your audio
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Credit packs */}
          <Card className="rounded-xl border-primary/30 bg-card relative overflow-hidden">
            <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-bl-xl">
              Save up to 50%
            </div>
            <CardContent className="p-6 sm:p-8">
              <h3 className="font-heading font-semibold text-lg mb-1">Credit packs</h3>
              <p className="text-sm text-muted-foreground mb-6">Create an account and buy credits for volume discounts.</p>
              <div className="space-y-3 mb-6">
                {CREDIT_PACKS.map(({ credits, price, perCredit, label }) => (
                  <div key={label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <span className="text-sm font-medium">{credits} credits</span>
                      <span className="text-xs text-muted-foreground ml-2">{label}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-heading font-semibold">${price}</span>
                      <span className="text-xs text-muted-foreground ml-1">(${perCredit}/ea)</span>
                    </div>
                  </div>
                ))}
              </div>
              {user ? (
                <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => navigate("/credits")}>
                  Buy more credits
                </Button>
              ) : (
                <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => navigate("/signup")}>
                  Get started
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t border-border/50 bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Shield className="w-4 h-4 text-accent" />
            <span>Your audio is deleted immediately after processing. No storage. No retention.</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Mic className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-heading font-semibold text-sm">WhatSaid</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
              <Link to="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            </div>
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} WhatSaid. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
