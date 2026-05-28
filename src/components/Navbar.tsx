import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
// Small (96×96) variant of the brand mark — sized for the 36×36 navbar slot
// (with a 2× factor for retina). The full-size logo.webp is reserved for
// OG/social cards and the manifest. Saves ~13 KiB on every page load.
import logoImg from "@/assets/logo-sm.webp";
import { useState, useEffect, useRef } from "react";
import NotificationBell from "@/components/NotificationBell";
import DesktopNav from "@/components/navbar/DesktopNav";
import MobileMenu from "@/components/navbar/MobileMenu";
import CreditBadge from "@/components/navbar/CreditBadge";

export default function Navbar() {
  const { user, creditBalance, isAdmin, avatarUrl, displayName, signOut } = useAuth();
  const location = useLocation();
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

  // Auto-close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const initials = user
    ? (displayName || user.user_metadata?.full_name || user.email || "U")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "";

  return (
    <nav className="sticky top-0 z-50 glass-navbar">
      {/* Skip-to-content link for keyboard users — visible only when focused.
          Targets the <main id="main-content"> in App.tsx. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-background focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-primary"
      >
        Skip to main content
      </a>
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        {/* Logo — alt="" + aria-hidden because the adjacent <span> already
            provides the accessible name "WhatSaid". Avoids redundant a11y label. */}
        <Link to="/" className="flex items-center gap-2 group">
          <img
            src={logoImg}
            alt=""
            aria-hidden="true"
            width={36}
            height={36}
            className="w-9 h-9 rounded-xl"
          />
          <span className="font-bold text-xl tracking-tight">WhatSaid</span>
        </Link>

        {/* Desktop nav */}
        <DesktopNav
          user={user}
          creditBalance={creditBalance}
          isAdmin={isAdmin}
          avatarUrl={avatarUrl}
          initials={initials}
          signOut={signOut}
        />

        {/* Mobile: credit badge + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {user && (
            <>
              <CreditBadge balance={creditBalance} isAdmin={isAdmin} size="sm" />
              <NotificationBell />
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={mobileOpen}
            aria-controls="primary-mobile-menu"
          >
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
        <MobileMenu
          user={user}
          isAdmin={isAdmin}
          signOut={signOut}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </nav>
  );
}
