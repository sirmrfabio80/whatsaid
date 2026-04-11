import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import AudioUploader from "@/components/AudioUploader";
import LanguageSelector from "@/components/LanguageSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { creditsForDuration, formatDuration } from "@/lib/pricing";
import { ArrowRight, FileAudio, Clock } from "lucide-react";

export default function Convert() {
  const { user, creditBalance } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [language, setLanguage] = useState("auto");
  const [customPrompt, setCustomPrompt] = useState("");

  const credits = creditsForDuration(duration);

  const handleFileSelected = useCallback((f: File, dur: number) => {
    setFile(f);
    setDuration(dur);
  }, []);

  const handleConvert = () => {
    console.log("Convert:", { file: file?.name, duration, language, customPrompt, credits });
  };

  const handleReset = () => {
    setFile(null);
    setDuration(0);
    setLanguage("auto");
    setCustomPrompt("");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight mb-2">Convert your audio</h1>
            <p className="text-muted-foreground">Upload a file to get a transcript, summary, and custom AI analysis.</p>
          </div>

          {/* Step 1: Upload */}
          <Card className="rounded-xl border-border/50 bg-card mb-6">
            <CardContent className="p-6 sm:p-8">
              <AudioUploader onFileSelected={handleFileSelected} />

              {file && duration > 0 && (
                <div className="mt-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* File info */}
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <FileAudio className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDuration(duration)} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Change
                    </button>
                  </div>

                  {/* Step 2: Configure */}
                  <div className="space-y-4">
                    <LanguageSelector value={language} onChange={setLanguage} />

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="custom-prompt">
                        Custom AI prompt <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <Textarea
                        id="custom-prompt"
                        placeholder="e.g. Extract all action items and who is responsible for each..."
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="rounded-xl resize-none min-h-[80px]"
                      />
                    </div>
                  </div>

                  {/* Step 3: Confirm */}
                  <div className="p-4 rounded-xl bg-muted/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        Duration
                      </div>
                      <span className="text-sm font-medium">{formatDuration(duration)}</span>
                    </div>
                  </div>

                  {user ? (
                    <Button
                      className="w-full h-12 text-base font-medium rounded-xl"
                      size="lg"
                      onClick={handleConvert}
                    >
                      Convert now<ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  ) : (
                    <div className="text-center space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Sign in to convert your audio.
                      </p>
                      <Button className="w-full rounded-xl" onClick={() => navigate("/login")}>
                        Sign in
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
