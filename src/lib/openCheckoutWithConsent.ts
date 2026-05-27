import { supabase } from "@/integrations/supabase/client";
import { openCheckout } from "@/lib/paddle-checkout";
import {
  REG37_CONSENT_TYPE,
  REG37_CONSENT_VERSION,
} from "@/lib/reg37-consent";

interface Opts {
  priceId: string;
  userId: string;
  email?: string;
  packageId?: string;
  successUrl?: string;
  onSuccess?: () => void;
}

/**
 * Records a Reg. 37 consent event for the current user, then opens Paddle
 * checkout with the resulting consent_id linked via `custom_data` so the
 * webhook can deterministically cross-check the purchase against the consent.
 *
 * Caller is expected to have already shown the Reg37ConsentDialog and
 * received both express-consent ticks.
 */
export async function openCheckoutWithConsent(opts: Opts): Promise<void> {
  const { data, error } = await supabase.functions.invoke("record-consent", {
    body: {
      consent_type: REG37_CONSENT_TYPE,
      version: REG37_CONSENT_VERSION,
      package_id: opts.packageId ?? opts.priceId,
    },
  });

  if (error || !data?.ok || !data?.consent_id) {
    throw new Error(
      (error as Error | null)?.message ?? "Could not record consent",
    );
  }

  await openCheckout({
    priceId: opts.priceId,
    userId: opts.userId,
    email: opts.email,
    successUrl: opts.successUrl,
    onSuccess: opts.onSuccess,
    customData: {
      consent_id: data.consent_id as string,
      consent_version: REG37_CONSENT_VERSION,
    },
  });
}
