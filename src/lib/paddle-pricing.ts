import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Currency = "GBP" | "USD" | "EUR";

export interface PricingProduct {
  id: "one-time" | "5-pack" | "20-pack";
  /** Paddle Price ID — null until real IDs are configured */
  paddlePriceId: string | null;
  basePriceGBP: number;
  title: string;
  subtitle: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
  credits?: number;
}

export interface LocalizedPrice {
  productId: PricingProduct["id"];
  formatted: string;
  amount: number;
  currency: Currency;
}

export interface PricingState {
  prices: LocalizedPrice[];
  loading: boolean;
  currency: Currency;
  isLocalized: boolean;
}

// ---------------------------------------------------------------------------
// Product definitions (base GBP prices — source of truth until Paddle is wired)
// ---------------------------------------------------------------------------

export const PRICING_PRODUCTS: PricingProduct[] = [
  {
    id: "one-time",
    paddlePriceId: null,
    basePriceGBP: 4.99,
    title: "pricing.oneTimeTitle",
    subtitle: "pricing.oneTimeSubtitle",
    features: [
      "pricing.featureOneFile",
      "pricing.featureTranscript",
      "pricing.featureSummary",
      "pricing.featureQuestions",
      "pricing.featureDownload",
      "pricing.featureSaved",
    ],
    cta: "pricing.oneTimeCta",
  },
  {
    id: "5-pack",
    paddlePriceId: null,
    basePriceGBP: 14.99,
    title: "pricing.fivePackTitle",
    subtitle: "pricing.fivePackSubtitle",
    credits: 5,
    features: [
      "pricing.featureFiveCredits",
      "pricing.featureOneCreditPerFile",
      "pricing.featureTranscript",
      "pricing.featureSummary",
      "pricing.featureQuestions",
      "pricing.featureDownload",
      "pricing.featureSavedAll",
    ],
    cta: "pricing.fivePackCta",
    highlighted: true,
    badge: "pricing.mostPopular",
  },
  {
    id: "20-pack",
    paddlePriceId: null,
    basePriceGBP: 39.99,
    title: "pricing.twentyPackTitle",
    subtitle: "pricing.twentyPackSubtitle",
    credits: 20,
    features: [
      "pricing.featureTwentyCredits",
      "pricing.featureOneCreditPerFile",
      "pricing.featureTranscript",
      "pricing.featureSummary",
      "pricing.featureQuestions",
      "pricing.featureDownload",
      "pricing.featureSavedAll",
    ],
    cta: "pricing.twentyPackCta",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

/**
 * Approximate GBP→X rates used ONLY as a pre-Paddle fallback.
 * These will be replaced by Paddle's real localized pricing once wired.
 * Updated periodically to stay reasonable.
 */
const FALLBACK_FX_FROM_GBP: Record<Currency, number> = {
  GBP: 1,
  USD: 1.33,
  EUR: 1.18,
};

/** Round to nearest .99 for clean pricing display */
function roundToNinetyNine(value: number): number {
  return Math.floor(value) + 0.99;
}

function formatPrice(amount: number, currency: Currency): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${CURRENCY_SYMBOLS[currency]}${amount.toFixed(2)}`;
  }
}

function basePrices(cur: Currency = "GBP"): LocalizedPrice[] {
  const rate = FALLBACK_FX_FROM_GBP[cur];
  return PRICING_PRODUCTS.map((p) => {
    const converted = cur === "GBP" ? p.basePriceGBP : roundToNinetyNine(p.basePriceGBP * rate);
    return {
      productId: p.id,
      formatted: formatPrice(converted, cur),
      amount: converted,
      currency: cur,
    };
  });
}

// ---------------------------------------------------------------------------
// Check if Paddle.js is loaded
// ---------------------------------------------------------------------------

function getPaddle(): any | null {
  if (typeof window !== "undefined" && (window as any).Paddle) {
    return (window as any).Paddle;
  }
  return null;
}

function hasPriceIds(): boolean {
  return PRICING_PRODUCTS.some((p) => p.paddlePriceId !== null);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaddlePricing(currencyOverride?: Currency): PricingState {
  const [prices, setPrices] = useState<LocalizedPrice[]>(() => basePrices(currencyOverride));
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<Currency>(currencyOverride ?? "GBP");
  const [isLocalized, setIsLocalized] = useState(false);

  const fetchPaddlePrices = useCallback(async (cur?: Currency) => {
    const paddle = getPaddle();
    if (!paddle || !hasPriceIds()) {
      // Paddle not available — use base prices in selected currency format
      setPrices(basePrices(cur));
      setCurrency(cur ?? "GBP");
      setIsLocalized(false);
      return;
    }

    setLoading(true);

    try {
      const items = PRICING_PRODUCTS
        .filter((p) => p.paddlePriceId)
        .map((p) => ({ priceId: p.paddlePriceId!, quantity: 1 }));

      const request: any = { items };

      // Only pass currencyCode when user explicitly overrides
      if (cur) {
        request.currencyCode = cur;
      }
      // Otherwise let Paddle auto-detect from buyer location

      const result = await paddle.PricePreview(request);

      if (result?.data?.details?.lineItems) {
        const localized: LocalizedPrice[] = result.data.details.lineItems.map(
          (item: any) => {
            const priceId = item.price?.id;
            const product = PRICING_PRODUCTS.find(
              (p) => p.paddlePriceId === priceId
            );
            const detectedCurrency =
              (result.data.currencyCode as Currency) || "GBP";
            return {
              productId: product?.id ?? "one-time",
              formatted: item.formattedTotals?.total ?? item.formattedTotals?.subtotal ?? "",
              amount: parseFloat(item.totals?.total ?? item.totals?.subtotal ?? "0") / 100,
              currency: detectedCurrency,
            };
          }
        );

        if (localized.length > 0) {
          setPrices(localized);
          setCurrency(localized[0].currency);
          setIsLocalized(true);
        }
      }
    } catch (err) {
      console.warn("[paddle-pricing] PricePreview failed, using GBP fallback", err);
      setPrices(basePrices(cur));
      setCurrency(cur ?? "GBP");
      setIsLocalized(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPaddlePrices(currencyOverride);
  }, [currencyOverride, fetchPaddlePrices]);

  return { prices, loading, currency, isLocalized };
}

export function getPriceForProduct(
  prices: LocalizedPrice[],
  productId: PricingProduct["id"]
): LocalizedPrice | undefined {
  return prices.find((p) => p.productId === productId);
}
