import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NotificationBell from "@/components/NotificationBell";
import UserMenu from "./UserMenu";
import CreditBadge from "./CreditBadge";
import type { User } from "@supabase/supabase-js";

interface DesktopNavProps {
  user: User | null;
  creditBalance: number;
  isAdmin: boolean;
  avatarUrl: string | null;
  initials: string;
  signOut: () => void;
}

export default function DesktopNav({
  user,
  creditBalance,
  isAdmin,
  avatarUrl,
  initials,
  signOut,
}: DesktopNavProps) {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="hidden md:flex items-center gap-1">
      <Link to="/pricing">
        <Button variant={location.pathname === "/pricing" ? "secondary" : "ghost"} size="sm" className="rounded-lg">
          {t("nav.pricing")}
        </Button>
      </Link>
      <Link to="/convert">
        <Button size="sm" className="rounded-lg">
          {t("nav.convert")}
        </Button>
      </Link>

      <div className="w-px h-6 bg-border mx-2" />

      {user ? (
        <div className="flex items-center gap-2">
          <CreditBadge balance={creditBalance} isAdmin={isAdmin} />
          <NotificationBell />
          <UserMenu avatarUrl={avatarUrl} initials={initials} isAdmin={isAdmin} signOut={signOut} />
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
  );
}
