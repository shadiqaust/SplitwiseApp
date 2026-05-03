import { useSyncExternalStore } from "react";

let displayCurrency = "USD";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setDisplayCurrency(c: string | null | undefined) {
  if (c && typeof c === "string" && c !== displayCurrency) {
    displayCurrency = c;
    listeners.forEach((cb) => cb());
  }
}

export function getDisplayCurrency(): string {
  return displayCurrency;
}

// Subscribe at the root so the whole tree re-renders when the viewer's
// preferred currency changes. The returned value is the current symbol code,
// but its real purpose is to register a React subscription.
export function useDisplayCurrency(): string {
  return useSyncExternalStore(subscribe, getDisplayCurrency, getDisplayCurrency);
}

export function formatCurrency(amount: number, _currency?: string) {
  const currency = displayCurrency;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
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

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
