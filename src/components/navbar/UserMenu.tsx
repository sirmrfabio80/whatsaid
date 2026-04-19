import { useNavigate } from "react-router-dom";
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
import { LogOut, History, User, Settings, ChevronDown, Shield, HelpCircle } from "lucide-react";
import ThemeMenuSection from "@/components/navbar/ThemeMenuSection";

interface UserMenuProps {
  avatarUrl: string | null;
  initials: string;
  isAdmin: boolean;
  signOut: () => void;
}

export default function UserMenu({ avatarUrl, initials, isAdmin, signOut }: UserMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
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
        <DropdownMenuItem onClick={() => navigate("/settings")} className="rounded-lg">
          <Settings className="w-4 h-4 mr-2" />
          {t("nav.settings")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/help")} className="rounded-lg">
          <HelpCircle className="w-4 h-4 mr-2" />
          {t("nav.help")}
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate("/admin")} className="rounded-lg">
            <Shield className="w-4 h-4 mr-2" />
            Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <ThemeMenuSection />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="rounded-lg">
          <LogOut className="w-4 h-4 mr-2" />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
