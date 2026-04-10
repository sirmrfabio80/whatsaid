import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import { Globe } from "lucide-react";

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  detectedLanguage?: string | null;
  disabled?: boolean;
}

export default function LanguageSelector({ value, onChange, detectedLanguage, disabled }: LanguageSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <Globe className="w-4 h-4 text-muted-foreground" />
        Language
        {detectedLanguage && (
          <span className="text-xs text-muted-foreground ml-1">(detected: {detectedLanguage})</span>
        )}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Auto-detect" />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
