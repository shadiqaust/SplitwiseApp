import { db, currenciesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function isSupportedCurrency(code: unknown): Promise<boolean> {
  if (typeof code !== "string" || code.trim() === "") return false;
  const [row] = await db
    .select({ code: currenciesTable.code })
    .from(currenciesTable)
    .where(eq(currenciesTable.code, code));
  return !!row;
}
