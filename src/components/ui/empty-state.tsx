import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Card variant uses dashed border + card background (matches History). */
  variant?: "card" | "plain";
  className?: string;
}

/**
 * Standard "nothing here yet" / "no results" presentation.
 * Use the `card` variant inside page bodies (default).
 * Use the `plain` variant inside containers that already provide a frame.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
  className,
}: EmptyStateProps) {
  const inner = (
    <div className={cn("flex flex-col items-center justify-center text-center", variant === "card" ? "py-16" : "py-10", className)}>
      {Icon ? <Icon className="w-12 h-12 text-muted-foreground/50 mb-4" aria-hidden="true" /> : null}
      <p className="text-h3 mb-1">{title}</p>
      {description ? (
        <p className="text-muted-foreground text-body-sm mb-6">{description}</p>
      ) : action ? (
        <div className="mb-2" />
      ) : null}
      {action}
    </div>
  );

  if (variant === "plain") return inner;

  return (
    <Card className="border-dashed rounded-xl shadow-sm">
      <CardContent>{inner}</CardContent>
    </Card>
  );
}
