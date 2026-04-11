import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mic, LogOut, CreditCard, History, Menu, X, User, Settings, ChevronDown } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const { user, creditBalance, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

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
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Mic className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-xl tracking-tight">WhatSaid</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <Link to="/convert">
            <Button variant={location.pathname === "/convert" ? "secondary" : "ghost"} size="sm" className="rounded-lg">
              Convert
            </Button>
          </Link>
          <a href="/#pricing">
            <Button variant="ghost" size="sm" className="rounded-lg">
              Pricing
            </Button>
          </a>

          <div className="w-px h-6 bg-border mx-2" />

          {user ? (
            <div className="flex items-center gap-2">
              {/* Credit badge — solid bg, no glass */}
              <div className="bg-muted border border-border px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-sm">
                <CreditCard className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium">{creditBalance}</span>
              </div>

              {/* Avatar dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 pl-2 pr-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                      {initials}
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="rounded-lg">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/history")} className="rounded-lg">
                    <History className="w-4 h-4 mr-2" />
                    History
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/credits")} className="rounded-lg">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Credits
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="rounded-lg">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="rounded-lg">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Link to="/login">
              <Button size="sm" className="rounded-lg">Sign in</Button>
            </Link>
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

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-card p-4 space-y-1 animate-page-enter">
          <Link to="/convert" onClick={() => setMobileOpen(false)}>
            <Button variant="ghost" className="w-full justify-start rounded-lg">Convert</Button>
          </Link>
          <a href="/#pricing" onClick={() => setMobileOpen(false)}>
            <Button variant="ghost" className="w-full justify-start rounded-lg">Pricing</Button>
          </a>

          <div className="h-px bg-border my-2" />

          {user ? (
            <>
              <Link to="/profile" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start rounded-lg">
                  <User className="w-4 h-4 mr-2" />Profile
                </Button>
              </Link>
              <Link to="/history" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start rounded-lg">
                  <History className="w-4 h-4 mr-2" />History
                </Button>
              </Link>
              <Link to="/credits" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start rounded-lg">
                  <CreditCard className="w-4 h-4 mr-2" />Credits
                </Button>
              </Link>
              <Link to="/settings" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start rounded-lg">
                  <Settings className="w-4 h-4 mr-2" />Settings
                </Button>
              </Link>
              <Button variant="ghost" className="w-full justify-start rounded-lg" onClick={() => { signOut(); setMobileOpen(false); }}>
                <LogOut className="w-4 h-4 mr-2" />Sign out
              </Button>
            </>
          ) : (
            <Link to="/login" onClick={() => setMobileOpen(false)}>
              <Button className="w-full rounded-lg">Sign in</Button>
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
