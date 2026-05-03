import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./requireAuth";

declare global {
  namespace Express {
    interface Request {
      dbUserRole?: string;
    }
  }
}

export async function requireSuperadmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, async () => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [u] = await db
      .select({ role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!u || u.role !== "superadmin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    req.dbUserRole = u.role;
    next();
  });
}
