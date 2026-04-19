import { useTranslation } from "react-i18next";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeMode } from "@/hooks/use-theme";

export default function ThemeMenuSection() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <DropdownMenuLabel className="text-caption text-muted-foreground font-normal">
        {t("theme.label", "Theme")}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(v) => setTheme(v as ThemeMode)}
      >
        <DropdownMenuRadioItem value="light" className="rounded-lg">
          <Sun className="w-4 h-4 mr-2" />
          {t("theme.light", "Light")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark" className="rounded-lg">
          <Moon className="w-4 h-4 mr-2" />
          {t("theme.dark", "Dark")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system" className="rounded-lg">
          <Monitor className="w-4 h-4 mr-2" />
          {t("theme.system", "System")}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
