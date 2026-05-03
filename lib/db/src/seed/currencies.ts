import { db } from "../index.js";
import { currenciesTable } from "../schema/currencies.js";
import { sql } from "drizzle-orm";

export const SEED_CURRENCIES: Array<{
  code: string;
  name: string;
  symbol: string;
  sortOrder: number;
}> = [
  { code: "USD", name: "US Dollar", symbol: "$", sortOrder: 10 },
  { code: "EUR", name: "Euro", symbol: "€", sortOrder: 20 },
  { code: "GBP", name: "British Pound", symbol: "£", sortOrder: 30 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", sortOrder: 40 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", sortOrder: 50 },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", sortOrder: 60 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", sortOrder: 70 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", sortOrder: 80 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", sortOrder: 90 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", sortOrder: 100 },
  { code: "AED", name: "UAE Dirham", symbol: "AED", sortOrder: 110 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", sortOrder: 120 },
];

export async function seedCurrencies(): Promise<void> {
  await db
    .insert(currenciesTable)
    .values(SEED_CURRENCIES)
    .onConflictDoUpdate({
      target: currenciesTable.code,
      set: {
        name: sql`excluded.name`,
        symbol: sql`excluded.symbol`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedCurrencies()
    .then(() => {
      console.log(`Seeded ${SEED_CURRENCIES.length} currencies`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to seed currencies:", err);
      process.exit(1);
    });
}
