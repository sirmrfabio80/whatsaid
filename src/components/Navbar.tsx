import { Link, useLocation, useNavigate } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, CreditCard, History, Menu, X, User, Settings, ChevronDown } from "lucide-react";
import logoImg from "@/assets/logo.webp";
import { useState, useEffect, useRef } from "react";

export default function Navbar() {
  const { user, creditBalance, avatarUrl, signOut } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastScrollY = useRef(0);

  // Auto-close mobile menu on scroll
  useEffect(() => {
    if (!mobileOpen) return;
    const onScroll = () => {
      if (Math.abs(window.scrollY - lastScrollY.current) > 10) {
        setMobileOpen(false);
      }
    };
    lastScrollY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mobileOpen]);

  const initials = user
    ? (user.user_metadata?.full_name || user.email || "U")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  return (
    <nav className="sticky top-0 z-50 glass-navbar">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <img src={logoImg} alt="WhatSaid" className="w-9 h-9 rounded-xl" />
          <span className="font-heading font-bold text-xl tracking-tight">WhatSaid</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <Link to="/convert">
            <Button variant={location.pathname === "/convert" ? "secondary" : "ghost"} size="sm" className="rounded-lg">
              {t("nav.convert")}
            </Button>
          </Link>
          <Link to="/pricing">
            <Button variant={location.pathname === "/pricing" ? "secondary" : "ghost"} size="sm" className="rounded-lg">
              {t("nav.pricing")}
            </Button>
          </Link>

          <div className="w-px h-6 bg-border mx-2" />

          {user ? (
            <div className="flex items-center gap-2">
              {/* Credit badge */}
              <div className="bg-muted border border-border px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm">
                <CreditCard className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium">{creditBalance}</span>
              </div>

              {/* Avatar dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 pl-2 pr-2">
                    <Avatar className="w-7 h-7 rounded-lg">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
                      <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="rounded-lg">
                    <User className="w-4 h-4 mr-2" />
                    {t("nav.profile")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/history")} className="rounded-lg">
                    <History className="w-4 h-4 mr-2" />
                    {t("nav.history")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/credits")} className="rounded-lg">
                    <CreditCard className="w-4 h-4 mr-2" />
                    {t("nav.credits")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="rounded-lg">
                    <Settings className="w-4 h-4 mr-2" />
                    {t("nav.settings")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="rounded-lg">
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("common.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Link to="/login">
                <Button size="sm" className="rounded-lg">{t("common.signIn")}</Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile: credit badge + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {user && (
            <div className="bg-muted border border-border px-2.5 py-1 rounded-lg flex items-center gap-1 text-xs">
              <CreditCard className="w-3 h-3 text-primary" />
              <span className="font-medium">{creditBalance}</span>
            </div>
          )}
          <Button variant="ghost" size="icon" className="rounded-lg" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 top-16 z-40 bg-black/40 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="relative z-50 md:hidden border-t border-border/50 glass-navbar px-4 py-3 origin-top animate-slide-down">
          <div className="space-y-1">
            <Link to="/convert" onClick={() => setMobileOpen(false)} className="block opacity-0 animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "forwards" }}>
              <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base">{t("nav.convert")}</Button>
            </Link>
            <Link to="/pricing" onClick={() => setMobileOpen(false)} className="block opacity-0 animate-fade-in" style={{ animationDelay: "60ms", animationFillMode: "forwards" }}>
              <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base">{t("nav.pricing")}</Button>
            </Link>
          </div>

          <div className="h-px bg-border my-3 opacity-0 animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "forwards" }} />

          {user ? (
            <div className="space-y-1">
              <Link to="/profile" onClick={() => setMobileOpen(false)} className="block opacity-0 animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "forwards" }}>
                <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
                  <User className="w-5 h-5" />{t("nav.profile")}
                </Button>
              </Link>
              <Link to="/history" onClick={() => setMobileOpen(false)} className="block opacity-0 animate-fade-in" style={{ animationDelay: "210ms", animationFillMode: "forwards" }}>
                <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
                  <History className="w-5 h-5" />{t("nav.history")}
                </Button>
              </Link>
              <Link to="/credits" onClick={() => setMobileOpen(false)} className="block opacity-0 animate-fade-in" style={{ animationDelay: "270ms", animationFillMode: "forwards" }}>
                <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
                  <CreditCard className="w-5 h-5" />{t("nav.credits")}
                </Button>
              </Link>
              <Link to="/settings" onClick={() => setMobileOpen(false)} className="block opacity-0 animate-fade-in" style={{ animationDelay: "330ms", animationFillMode: "forwards" }}>
                <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3">
                  <Settings className="w-5 h-5" />{t("nav.settings")}
                </Button>
              </Link>
              <div className="h-px bg-border my-3 opacity-0 animate-fade-in" style={{ animationDelay: "370ms", animationFillMode: "forwards" }} />
              <div className="opacity-0 animate-fade-in" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
                <Button variant="ghost" className="w-full justify-start rounded-lg h-12 text-base gap-3" onClick={() => { signOut(); setMobileOpen(false); }}>
                  <LogOut className="w-5 h-5" />{t("common.signOut")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 opacity-0 animate-fade-in" style={{ animationDelay: "150ms", animationFillMode: "forwards" }}>
              <LanguageSwitcher />
              <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1">
                <Button className="w-full rounded-lg h-12 text-base">{t("common.signIn")}</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
