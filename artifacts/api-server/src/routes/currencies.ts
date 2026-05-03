import { Router, type IRouter } from "express";
import { db, currenciesTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/currencies", async (_req, res) => {
  const rows = await db
    .select({
      code: currenciesTable.code,
      name: currenciesTable.name,
      symbol: currenciesTable.symbol,
    })
    .from(currenciesTable)
    .orderBy(asc(currenciesTable.sortOrder), asc(currenciesTable.code));
  res.json(rows);
});

export default router;
