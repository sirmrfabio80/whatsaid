import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LogOut, History, User as UserIcon, Settings, Shield, HelpCircle, Sun, Moon, Monitor } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTheme, type ThemeMode } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

interface MobileMenuProps {
  user: User | null;
  isAdmin: boolean;
  signOut: () => void;
  onClose: () => void;
}

export default function MobileMenu({ user, isAdmin, signOut, onClose }: MobileMenuProps) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const themeOptions: { value: ThemeMode; icon: typeof Sun; label: string }[] = [
    { value: "light", icon: Sun, label: t("theme.light", "Light") },
    { value: "dark", icon: Moon, label: t("theme.dark", "Dark") },
    { value: "system", icon: Monitor, label: t("theme.system", "System") },
  ];

  return (
    <div className="relative z-50 md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl px-4 py-3 origin-top animate-slide-down">
      <div className="space-y-1">
        <Link to="/pricing" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "forwards" }}>
          <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base">{t("nav.pricing")}</Button>
        </Link>
        <Link to="/convert" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "60ms", animationFillMode: "forwards" }}>
          <Button className="w-full justify-start rounded-lg h-12 text-base">{t("nav.convert")}</Button>
        </Link>
      </div>

      <div className="h-px bg-border my-3 opacity-0 animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "forwards" }} />

      {user ? (
        <div className="space-y-1">
          <Link to="/profile" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "forwards" }}>
            <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
              <UserIcon className="w-5 h-5" />{t("nav.profile")}
            </Button>
          </Link>
          <Link to="/history" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "210ms", animationFillMode: "forwards" }}>
            <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
              <History className="w-5 h-5" />{t("nav.history")}
            </Button>
          </Link>
          <Link to="/settings" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "330ms", animationFillMode: "forwards" }}>
            <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
              <Settings className="w-5 h-5" />{t("nav.settings")}
            </Button>
          </Link>
          <Link to="/help" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "340ms", animationFillMode: "forwards" }}>
            <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
              <HelpCircle className="w-5 h-5" />{t("nav.help")}
            </Button>
          </Link>
          {isAdmin && (
            <Link to="/admin" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "350ms", animationFillMode: "forwards" }}>
              <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
                <Shield className="w-5 h-5" />Admin
              </Button>
            </Link>
          )}
          <div className="h-px bg-border my-3 opacity-0 animate-fade-in" style={{ animationDelay: "370ms", animationFillMode: "forwards" }} />
          <div className="px-1 opacity-0 animate-fade-in" style={{ animationDelay: "385ms", animationFillMode: "forwards" }}>
            <div className="text-caption text-muted-foreground mb-1.5 px-1">{t("theme.label", "Theme")}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {themeOptions.map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  variant={theme === value ? "default" : "ghost"}
                  size="sm"
                  className={cn("rounded-lg h-10 flex-col gap-0.5 text-[11px]", theme === value && "ring-2 ring-primary/30")}
                  onClick={() => setTheme(value)}
                  aria-pressed={theme === value}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="h-px bg-border my-3 opacity-0 animate-fade-in" style={{ animationDelay: "395ms", animationFillMode: "forwards" }} />
          <div className="opacity-0 animate-fade-in" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
            <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3" onClick={() => { signOut(); onClose(); }}>
              <LogOut className="w-5 h-5" />{t("common.signOut")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Link to="/help" onClick={onClose} className="block opacity-0 animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "forwards" }}>
            <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
              <HelpCircle className="w-5 h-5" />{t("nav.help")}
            </Button>
          </Link>
          <div className="flex items-center justify-between gap-3 pt-2 opacity-0 animate-fade-in" style={{ animationDelay: "210ms", animationFillMode: "forwards" }}>
            <LanguageSwitcher />
            <Link to="/login" onClick={onClose} className="flex-1">
              <Button className="w-full rounded-lg h-12 text-base">{t("common.signIn")}</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
