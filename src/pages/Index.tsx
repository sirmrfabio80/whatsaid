import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AudioUploader from "@/components/AudioUploader";
import LanguageSelector from "@/components/LanguageSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { creditsForDuration, guestPriceForDuration, formatDuration } from "@/lib/pricing";
import { Mic, Sparkles, FileText, Users, ArrowRight, Zap, Shield, Clock } from "lucide-react";

export default function Index() {
  const { user, creditBalance } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [language, setLanguage] = useState("auto");

  const credits = creditsForDuration(duration);
  const guestPrice = guestPriceForDuration(duration);
  const hasEnoughCredits = user && creditBalance >= credits;

  const handleFileSelected = useCallback((f: File, dur: number) => {
    setFile(f);
    setDuration(dur);
  }, []);

  const handleTranscribe = () => {
    // TODO: Implement actual upload + payment/credit flow
    // For now navigate to a processing placeholder
    if (user) {
      // Account flow: deduct credits + process
      console.log("Account flow:", { file: file?.name, duration, language, credits });
    } else {
      // Guest flow: redirect to Stripe checkout
      console.log("Guest flow:", { file: file?.name, duration, language, price: guestPrice.price });
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="container mx-auto px-4 py-16 sm:py-24 relative">
          <div className="max-w-3xl mx-auto text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              AI-powered transcription with speaker labels
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              Know exactly what was{" "}
              <span className="text-primary">said</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto">
              Upload any audio file and get a full transcript with speaker labels, a summary, key actions, and custom AI analysis — in minutes.
            </p>
          </div>

          {/* Upload card */}
          <Card className="max-w-2xl mx-auto shadow-lg border-border/50">
            <CardContent className="p-6 sm:p-8 space-y-6">
              <AudioUploader onFileSelected={handleFileSelected} />

              {file && duration > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <LanguageSelector value={language} onChange={setLanguage} />

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm text-muted-foreground">Duration</p>
                      <p className="font-medium">{formatDuration(duration)}</p>
                    </div>
                    <div className="text-right">
                      {user ? (
                        <>
                          <p className="text-sm text-muted-foreground">Cost</p>
                          <p className="font-medium">{credits} credit{credits > 1 ? "s" : ""}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">One-time price</p>
                          <p className="font-heading font-bold text-xl">{guestPrice.label}</p>
                        </>
                      )}
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 text-base font-medium"
                    size="lg"
                    onClick={handleTranscribe}
                    disabled={user ? !hasEnoughCredits : false}
                  >
                    {user ? (
                      hasEnoughCredits ? (
                        <>Transcribe now<ArrowRight className="w-4 h-4 ml-2" /></>
                      ) : (
                        "Not enough credits"
                      )
                    ) : (
                      <>Pay {guestPrice.label} & transcribe<ArrowRight className="w-4 h-4 ml-2" /></>
                    )}
                  </Button>

                  {user && !hasEnoughCredits && (
                    <Button variant="outline" className="w-full" onClick={() => navigate("/credits")}>
                      Buy more credits
                    </Button>
                  )}

                  {!user && (
                    <p className="text-center text-sm text-muted-foreground">
                      No account needed.{" "}
                      <button onClick={() => navigate("/signup")} className="text-primary hover:underline">
                        Sign up
                      </button>{" "}
                      for credit packs and save up to 50%.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16 sm:py-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { icon: Users, title: "Speaker identification", desc: "Know who said what with automatic speaker labels and diarization." },
            { icon: FileText, title: "Three outputs per file", desc: "Full transcript, smart summary with key actions, and custom AI analysis from your prompt." },
            { icon: Zap, title: "99 languages", desc: "Auto-detects the spoken language — or manually select one before processing." },
            { icon: Shield, title: "Audio deleted after processing", desc: "Your audio is never stored. Files are deleted immediately after transcription." },
            { icon: Clock, title: "Pay as you go", desc: "No subscription. Pay per job as a guest, or buy credit packs for volume discounts." },
            { icon: Sparkles, title: "Custom AI prompts", desc: "Ask anything about your transcript — extract quotes, action items, decisions, or anything else." },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
