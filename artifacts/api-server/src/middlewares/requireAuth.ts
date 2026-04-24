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

  // Look up or create the user in the DB
  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));

  if (!user) {
    // Auto-provision the user on first authenticated request
    const sessionClaims = auth.sessionClaims as Record<string, unknown> | undefined;
    const email = (sessionClaims?.email as string) || `${clerkId}@unknown.com`;
    const name = (sessionClaims?.name as string) || (sessionClaims?.full_name as string) || "User";
    const avatarUrl = (sessionClaims?.image_url as string) || null;

    [user] = await db.insert(usersTable).values({
      clerkId,
      name,
      email,
      avatarUrl,
    }).returning();
  }

  req.dbUserId = user.id;
  next();
}
