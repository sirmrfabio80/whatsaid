import { useCallback, useState, useRef } from "react";
import { Upload, FileAudio, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isValidAudioFile, MAX_FILE_SIZE, ACCEPTED_EXTENSIONS, formatDuration } from "@/lib/pricing";

interface AudioUploaderProps {
  onFileSelected: (file: File, durationSeconds: number) => void;
  disabled?: boolean;
}

export default function AudioUploader({ onFileSelected, disabled }: AudioUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [detecting, setDetecting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setSelectedFile(null);
    setDuration(null);

    if (!isValidAudioFile(file)) {
      setError(`Unsupported format. Please upload ${ACCEPTED_EXTENSIONS.join(", ")} files.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("File too large. Maximum size is 200 MB.");
      return;
    }

    setDetecting(true);
    setSelectedFile(file);

    // Detect duration using Web Audio API
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = "metadata";
      const dur = await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => {
          URL.revokeObjectURL(url);
          if (audio.duration === Infinity || isNaN(audio.duration)) {
            reject(new Error("Could not detect duration"));
          } else {
            resolve(audio.duration);
          }
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Could not read audio file"));
        };
        audio.src = url;
      });

      if (dur > 3600) {
        setError("File is longer than 60 minutes. Please trim your audio.");
        setSelectedFile(null);
        setDetecting(false);
        return;
      }

      setDuration(dur);
      setDetecting(false);
      onFileSelected(file, dur);
    } catch {
      setError("Could not read audio file. Please try a different format.");
      setSelectedFile(null);
      setDetecting(false);
    }
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const clear = () => {
    setSelectedFile(null);
    setDuration(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full">
      {!selectedFile ? (
        <div
          className={`relative glass-dropzone rounded-xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
            dragOver ? "!border-primary !border-solid shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]" : "hover:border-primary/50"
          } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".m4a,.mp3,.wav,audio/*"
            className="hidden"
            onChange={handleChange}
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-heading font-semibold text-lg">Drop your audio file here</p>
              <p className="text-muted-foreground text-sm mt-1">
                or click to browse · .m4a, .mp3, .wav · max 60 min / 200 MB
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            🔒 Your audio is processed securely and deleted immediately after. Please ensure all recorded parties are aware of the recording.
          </div>
        </div>
      ) : (
        <div className="border rounded-xl p-6 bg-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileAudio className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {detecting ? "Detecting duration..." : duration ? formatDuration(duration) : ""}
                {!detecting && selectedFile && ` · ${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={clear} disabled={disabled}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mt-3 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
