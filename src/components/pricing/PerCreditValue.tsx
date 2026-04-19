import { useTranslation } from "react-i18next";
import {
  PRICING_PRODUCTS,
  type LocalizedPrice,
  type PricingProduct,
} from "@/lib/paddle-pricing";

interface Props {
  product: PricingProduct;
  localized: LocalizedPrice | undefined;
}

/**
 * Computes per-credit value and savings vs the one-time (1-credit) base price
 * in the same currency the user is currently viewing.
 *
 * Renders nothing for the one-time product or if credits are missing.
 */
export function PerCreditValue({ product, localized }: Props) {
  const { t } = useTranslation();

  if (!product.credits || product.credits <= 1) return null;

  const onePack = PRICING_PRODUCTS.find((p) => p.id === "one-time");
  if (!onePack) return null;

  // Resolve unit prices in the same numeric system as the displayed `localized`.
  // Falls back to GBP base prices if localized data isn't ready yet.
  const packTotal = localized?.amount ?? product.basePriceGBP;
  const symbol = localized?.formatted?.match(/^[^\d\s.,-]+/)?.[0] ?? "£";

  const perCredit = packTotal / product.credits;
  const oneTimeUnit = onePack.basePriceGBP; // best available reference

  // Savings ratio computed against the GBP base ratio (currency-agnostic),
  // since FX and rounding can distort raw subtraction in non-GBP currencies.
  const baseTotalGBP = product.basePriceGBP;
  const baseUnitGBP = baseTotalGBP / (product.credits ?? 1);
  const savingsPct = Math.round((1 - baseUnitGBP / onePack.basePriceGBP) * 100);

  return (
    <p className="text-caption text-primary mt-1.5">
      {symbol}
      {perCredit.toFixed(2)} {t("pricing.perCreditPerUnit")}
      {savingsPct > 0 && (
        <>
          {" · "}
          {t("pricing.perCreditSave", { pct: savingsPct })}
        </>
      )}
    </p>
  );
}
