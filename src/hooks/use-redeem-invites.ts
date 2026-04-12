import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function useRedeemInvites(userId: string | undefined, email: string | undefined) {
  const redeemed = useRef(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!userId || !email || redeemed.current) return;
    // Only run once per session
    const sessionKey = `invite_redeemed_${userId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    redeemed.current = true;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("redeem-invite");
        if (error) return;
        if (data?.totalCredits > 0) {
          sessionStorage.setItem(sessionKey, "1");
          toast.success(
            t("settings.admin.creditsReceived", { count: data.totalCredits })
          );
        }
      } catch {
        // silent
      }
    })();
  }, [userId, email, t]);
}
