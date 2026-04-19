import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import logoImg from "@/assets/logo.webp";
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
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <img src={logoImg} alt="WhatSaid" className="w-9 h-9 rounded-xl" />
          <span className="font-heading font-bold text-xl tracking-tight">WhatSaid</span>
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
