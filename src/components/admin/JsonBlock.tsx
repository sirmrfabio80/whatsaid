import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface JsonBlockProps {
  data: unknown;
  title?: string;
  defaultCollapsed?: boolean;
  maxHeight?: string;
}

export default function JsonBlock({
  data,
  title,
  defaultCollapsed = false,
  maxHeight = "32rem",
}: JsonBlockProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const { copied, copy } = useCopyToClipboard({
    successMessage: "Copied to clipboard",
    errorMessage: "Could not copy",
    resetMs: 1500,
  });

  const pretty = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const isEmpty = data === null || data === undefined;

  const handleCopy = () => copy(pretty);

  return (
    <div className="rounded-lg border bg-muted/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {title ?? "JSON"}
          {isEmpty && (
            <span className="text-xs text-muted-foreground font-normal">(empty)</span>
          )}
        </button>
        {!isEmpty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1.5 text-xs"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      {!collapsed && !isEmpty && (
        <pre
          className={cn(
            "overflow-auto text-xs leading-relaxed p-3 font-mono",
            "bg-background/60 rounded-b-lg",
          )}
          style={{ maxHeight }}
        >
          {pretty}
        </pre>
      )}
    </div>
  );
}
