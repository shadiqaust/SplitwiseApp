import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      dbUserId?: number;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const clerkId = auth?.userId;

  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));

  if (!user) {
    const sessionClaims = auth.sessionClaims as Record<string, unknown> | undefined;
    const claimsEmail = (sessionClaims?.email as string | undefined) ?? null;
    const email = claimsEmail ?? `${clerkId}@unknown.com`;
    const name =
      (sessionClaims?.name as string | undefined) ||
      (sessionClaims?.full_name as string | undefined) ||
      "User";
    const avatarUrl = (sessionClaims?.image_url as string | undefined) ?? null;

    if (claimsEmail) {
      const [existingByEmail] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, claimsEmail));

      if (existingByEmail) {
        [user] = await db
          .update(usersTable)
          .set({ clerkId, name, avatarUrl })
          .where(eq(usersTable.id, existingByEmail.id))
          .returning();
      }
    }

    if (!user) {
      [user] = await db
        .insert(usersTable)
        .values({ clerkId, name, email, avatarUrl })
        .returning();
    }
  }

  req.dbUserId = user.id;
  next();
}
