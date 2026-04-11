import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";

import {
  Mic, Sparkles, FileText, Users, ArrowRight, Shield, Clock,
  Upload, Cpu, Download, Globe, MessageSquareText
} from "lucide-react";

export default function Index() {
  const { user, creditBalance } = useAuth();
  const navigate = useNavigate();
  const howItWorks = useScrollReveal();
  const capabilities = useScrollReveal();
  const pricing = useScrollReveal();
  const trust = useScrollReveal();

  return (
    <div className="min-h-[calc(100vh-4rem)] animate-page-enter">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-primary/3 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 py-20 sm:py-32 relative">
          <div className="max-w-3xl mx-auto text-center animate-stagger">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium mb-6 animate-page-enter">
              <Sparkles className="w-3.5 h-3.5" />
              AI transcription + speaker labels
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1] animate-page-enter">
              Know exactly what was{" "}
              <span className="text-primary">said</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed animate-page-enter">
              Upload any audio file and get a full transcript with speaker labels, a summary, key actions, and custom AI analysis — in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-page-enter">
              <Button size="lg" className="h-12 px-8 text-base font-medium rounded-lg" onClick={() => navigate("/convert")}>
                Convert your audio
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base rounded-lg" asChild>
                <a href="#pricing">See pricing</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border bg-muted/30">
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
      <section ref={howItWorks.ref} className="container mx-auto px-4 py-16 sm:py-24">
        <div className={`text-center mb-12 transition-all duration-700 ${howItWorks.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">How it works</h2>
          <p className="text-muted-foreground max-w-md mx-auto">Three simple steps to go from audio to insight.</p>
        </div>
        <div className={`grid sm:grid-cols-3 gap-8 max-w-3xl mx-auto transition-all duration-700 delay-200 ${howItWorks.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
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
      <section ref={capabilities.ref} className="bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 py-16 sm:py-24">
          <div className={`text-center mb-12 transition-all duration-700 ${capabilities.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">Everything you need</h2>
            <p className="text-muted-foreground max-w-md mx-auto">One upload, three outputs — plus custom AI analysis from your own prompt.</p>
          </div>
          <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto transition-all duration-700 delay-200 ${capabilities.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {[
              { icon: Users, title: "Speaker identification", desc: "Know who said what with automatic speaker labels and diarization." },
              { icon: FileText, title: "Three outputs per file", desc: "Full transcript, smart summary with key actions, and custom AI analysis from your prompt." },
              { icon: Globe, title: "99 languages", desc: "Auto-detects the spoken language — or manually select one before processing." },
              { icon: Shield, title: "Audio deleted after processing", desc: "Your audio is deleted immediately after transcription. Only your transcripts and outputs are retained." },
              { icon: Clock, title: "Fast turnaround", desc: "Upload and get your results in minutes — no waiting, no queues." },
              { icon: MessageSquareText, title: "Custom AI prompts", desc: "Ask anything about your transcript — extract quotes, action items, decisions, or anything else." },
            ].map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="rounded-xl border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all bg-card">
                <CardContent className="p-5 sm:p-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-heading font-semibold text-base mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing - coming soon */}
      <section ref={pricing.ref} id="pricing" className="container mx-auto px-4 py-16 sm:py-24">
        <div className={`text-center mb-8 transition-all duration-700 ${pricing.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <h2 className="font-heading text-2xl sm:text-3xl font-semibold mb-3">Pricing coming soon</h2>
          <p className="text-muted-foreground max-w-md mx-auto">WhatSaid is currently in private beta. Pricing details will be available when we launch publicly.</p>
        </div>
        <div className={`flex justify-center transition-all duration-700 delay-200 ${pricing.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <Button size="lg" className="h-12 px-8 text-base font-medium rounded-lg" onClick={() => navigate("/convert")}>
            Convert your audio
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Trust strip */}
      <section ref={trust.ref} className="border-t border-border bg-muted/30">
        <div className={`container mx-auto px-4 py-8 transition-all duration-700 ${trust.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Shield className="w-4 h-4 text-primary" />
            <span>Audio files are deleted immediately after processing. Transcripts and outputs are retained in your account.</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="container mx-auto px-4 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Mic className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-heading font-semibold text-sm">WhatSaid</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                Premium AI transcription with speaker labels, summaries, and custom analysis. Privacy-first — audio deleted after processing.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-heading font-semibold text-sm mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/convert" className="hover:text-foreground transition-colors">Convert audio</Link></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><Link to="/login" className="hover:text-foreground transition-colors">Sign in</Link></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-heading font-semibold text-sm mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} WhatSaid. All rights reserved.</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              <span>Audio deleted after processing</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
