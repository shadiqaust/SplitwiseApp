let displayCurrency = "USD";

export function setDisplayCurrency(c: string | null | undefined) {
  if (c && typeof c === "string") displayCurrency = c;
}

export function getDisplayCurrency(): string {
  return displayCurrency;
}

export function formatCurrency(amount: number, _currency?: string): string {
  const currency = displayCurrency;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${getCurrencySymbol(currency)}${amount.toFixed(2)}`;
  }
}

export function getCurrencySymbol(_currency?: string): string {
  const currency = displayCurrency;
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
