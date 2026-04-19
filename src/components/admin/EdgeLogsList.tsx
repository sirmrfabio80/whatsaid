import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface EdgeLog {
  timestamp: number;
  function_name: string | null;
  level: string | null;
  event_message: string;
}

function tryParseEvent(msg: string): { event: string | null; pretty: string } {
  // Many of our logs are JSON one-liners with an `event` key
  try {
    const parsed = JSON.parse(msg);
    if (parsed && typeof parsed === "object") {
      const event = (parsed.event as string) ?? null;
      return { event, pretty: JSON.stringify(parsed, null, 2) };
    }
  } catch {
    // not JSON
  }
  return { event: null, pretty: msg };
}

const levelColor: Record<string, string> = {
  error: "text-destructive",
  warning: "text-amber-500",
  info: "text-foreground",
  log: "text-muted-foreground",
};

export default function EdgeLogsList({ logs }: { logs: EdgeLog[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-h3">
          Edge function logs <span className="text-caption font-normal text-muted-foreground">({logs.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No log entries reference this job id.</p>
        ) : (
          <ScrollArea className="h-[28rem] rounded-md border bg-muted/20">
            <div className="divide-y">
              {logs.map((log, idx) => {
                const { event, pretty } = tryParseEvent(log.event_message);
                const ts = new Date(Math.floor(log.timestamp / 1000)).toLocaleTimeString();
                return (
                  <details key={idx} className="group">
                    <summary className="cursor-pointer list-none px-3 py-2 hover:bg-muted/40 flex items-start gap-2 text-xs">
                      <span className="font-mono text-muted-foreground shrink-0">{ts}</span>
                      <span
                        className={cn(
                          "font-semibold shrink-0",
                          levelColor[log.level ?? "log"] ?? "text-foreground",
                        )}
                      >
                        {event ?? log.level ?? "log"}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {event ? log.event_message.slice(0, 200) : log.event_message.slice(0, 200)}
                      </span>
                    </summary>
                    <pre className="text-xs px-3 pb-3 pt-1 font-mono whitespace-pre-wrap break-all bg-background/40">
                      {pretty}
                    </pre>
                  </details>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
