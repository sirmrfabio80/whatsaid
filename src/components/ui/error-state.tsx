import { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "card" | "plain";
  className?: string;
}

/**
 * Standard error presentation. Visually distinct from EmptyState
 * (destructive icon + tone) so users can tell "broken" from "empty".
 */
export function ErrorState({
  title,
  description,
  action,
  variant = "card",
  className,
}: ErrorStateProps) {
  const inner = (
    <div className={cn("flex flex-col items-center justify-center text-center", variant === "card" ? "py-16" : "py-10", className)}>
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
      </div>
      <p className="text-h3 mb-1">{title}</p>
      {description ? (
        <p className="text-muted-foreground text-body-sm mb-6 max-w-md">{description}</p>
      ) : null}
      {action}
    </div>
  );

  if (variant === "plain") return inner;

  return (
    <Card className="border-destructive/30 rounded-xl shadow-sm">
      <CardContent>{inner}</CardContent>
    </Card>
  );
}
