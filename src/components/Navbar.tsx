import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Mic, User, LogOut, CreditCard, History, Menu, X } from "lucide-react";
import { useState } from "react";

export default function Navbar() {
  const { user, creditBalance, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 glass border-b">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Mic className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-xl tracking-tight">WhatSaid</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <>
              <Link to="/history">
                <Button variant={location.pathname === "/history" ? "secondary" : "ghost"} size="sm">
                  <History className="w-4 h-4 mr-1.5" />
                  History
                </Button>
              </Link>
              <Link to="/credits">
                <Button variant="outline" size="sm">
                  <CreditCard className="w-4 h-4 mr-1.5" />
                  {creditBalance} credits
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-1.5" />
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link to="/signup">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-card p-4 space-y-2">
          {user ? (
            <>
              <Link to="/history" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start"><History className="w-4 h-4 mr-2" />History</Button>
              </Link>
              <Link to="/credits" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full justify-start"><CreditCard className="w-4 h-4 mr-2" />{creditBalance} credits</Button>
              </Link>
              <Button variant="ghost" className="w-full justify-start" onClick={() => { signOut(); setMobileOpen(false); }}>
                <LogOut className="w-4 h-4 mr-2" />Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" className="w-full">Sign in</Button>
              </Link>
              <Link to="/signup" onClick={() => setMobileOpen(false)}>
                <Button className="w-full">Get started</Button>
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
