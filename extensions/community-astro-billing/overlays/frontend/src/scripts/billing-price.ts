export type BillingPrice = {
  unitAmount: number;
  currency: string;
  interval: "month" | "year" | "week" | "day" | null;
  intervalCount: number;
};

export function formatBillingPrice(price: BillingPrice): string {
  const formatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: price.currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  // Stripe amounts use the currency's minor unit (including zero-decimal currencies).
  const amount = price.unitAmount / 10 ** digits;
  const formatted = new Intl.NumberFormat("es-ES", {
    // Whole amounts without decimals ("29 €"), others with all of them ("9,90 €").
    style: "currency", currency: price.currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
  }).format(amount);
  if (!price.interval) return formatted;
  const units = { month: ["mes", "meses"], year: ["año", "años"], week: ["semana", "semanas"], day: ["día", "días"] };
  const [singular, plural] = units[price.interval];
  return price.intervalCount > 1 ? `${formatted} cada ${price.intervalCount} ${plural}` : `${formatted}/${singular}`;
}
