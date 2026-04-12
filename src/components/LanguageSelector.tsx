import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <Globe className="w-4 h-4 text-muted-foreground" />
        {t("languageSelector.language")}
        {detectedLanguage && (
          <span className="text-xs text-muted-foreground ml-1">{t("languageSelector.detected", { lang: detectedLanguage })}</span>
        )}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("languageSelector.autoDetect")} />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
