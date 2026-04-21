/** Currency symbol lookup for common currencies */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", CNY: "\u00A5", EUR: "\u20AC", JPY: "\u00A5", GBP: "\u00A3",
  KRW: "\u20A9", INR: "\u20B9", RUB: "\u20BD", THB: "\u0E3F", BRL: "R$",
  AUD: "A$", CAD: "C$", CHF: "CHF", SGD: "S$", HKD: "HK$", TWD: "NT$",
};

/** Format a price with currency symbol */
export function formatPrice(price: number, currency: string): string {
  const sym = CURRENCY_SYMBOLS[currency] || currency;
  return `${sym}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
