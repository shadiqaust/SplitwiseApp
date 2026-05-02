// Supported currency codes. Keep in sync with COMMON_CURRENCIES on web/mobile.
export const SUPPORTED_CURRENCY_CODES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "SGD",
  "AED",
  "BDT",
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCY_CODES)[number];

export function isSupportedCurrency(code: unknown): code is SupportedCurrencyCode {
  return typeof code === "string" && (SUPPORTED_CURRENCY_CODES as readonly string[]).includes(code);
}
