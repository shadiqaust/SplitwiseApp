import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "./requireAuth";

// Hybrid enforcement: callers must have a confirmed email before performing
// state-changing actions. Read-only endpoints remain accessible so users
// can still browse the app while their verification is pending.
export async function requireVerifiedEmail(
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
      .select({ emailVerifiedAt: usersTable.emailVerifiedAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!u) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (!u.emailVerifiedAt) {
      res.status(403).json({
        error: "Email verification required",
        code: "EMAIL_NOT_VERIFIED",
      });
      return;
    }
    next();
  });
}
