import { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditBadgeProps {
  balance: number;
  isAdmin: boolean;
  size?: "sm" | "md";
}

export default function CreditBadge({ balance, isAdmin, size = "md" }: CreditBadgeProps) {
  const isSm = size === "sm";
  return (
    <div
      className={cn(
        "bg-muted border border-border rounded-lg flex items-center font-medium",
        isSm ? "px-2.5 py-1 gap-1 text-xs" : "px-3 py-1.5 gap-1.5 text-sm"
      )}
    >
      <CreditCard className={cn("text-primary", isSm ? "w-3 h-3" : "w-3.5 h-3.5")} />
      <span>{isAdmin ? "∞" : balance}</span>
    </div>
  );
}
