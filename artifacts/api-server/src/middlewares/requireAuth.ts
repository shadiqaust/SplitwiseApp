import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "../lib/jwt";

declare global {
  namespace Express {
    interface Request {
      dbUserId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Wrap the user lookup so that malformed payloads (e.g. legacy integer
  // userIds in stale tokens after the UUID migration) return 401 instead of
  // crashing with a Postgres type error — this lets the client auto-logout
  // handler kick in cleanly.
  let user;
  try {
    [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.dbUserId = user.id;
  next();
}
