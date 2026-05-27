import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

/**
 * Shown on signup/login when the user's region is not supported.
 * WhatSaid is currently available to UK residents only.
 */
export function RegionBlockedNotice({ reason }: { reason?: string }) {
  const title = "WhatSaid is only available in the United Kingdom";
  const detail =
    reason === "declared_not_gb"
      ? "Please select United Kingdom to continue, or contact us if you believe this is an error."
      : reason === "ip_not_gb"
        ? "Your connection appears to be outside the UK. WhatSaid is currently available to UK residents only."
        : "Your account is registered to a region we don’t yet support. WhatSaid is currently available to UK residents only.";

  return (
    <Alert variant="destructive" className="rounded-xl">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{detail}</p>
        <p className="text-sm opacity-90">
          If you’re in the UK but using a VPN or a network that hides your
          location, please disable it and try again — or contact support.
        </p>
        <p>
          Questions?{" "}
          <a
            href="mailto:support@whatsaid.app"
            className="underline font-medium"
          >
            support@whatsaid.app
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
