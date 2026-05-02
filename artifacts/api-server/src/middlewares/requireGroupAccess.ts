import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  expensesTable,
  groupMembersTable,
  paymentsTable,
} from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      authorizedGroupId?: string;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramId(req: Request, name: string): string | null {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  return UUID_RE.test(value) ? value : null;
}

async function isMember(groupId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.userId, userId),
      ),
    );
  return Boolean(row);
}

export function requireGroupMember(paramName = "groupId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const groupId = paramId(req, paramName);
    if (groupId === null) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    if (!(await isMember(groupId, userId))) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    req.authorizedGroupId = groupId;
    next();
  };
}

export function requireExpenseAccess(paramName = "expenseId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const expenseId = paramId(req, paramName);
    if (expenseId === null) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    const [expense] = await db
      .select({ id: expensesTable.id, groupId: expensesTable.groupId })
      .from(expensesTable)
      .where(eq(expensesTable.id, expenseId));
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    if (!(await isMember(expense.groupId, userId))) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    req.authorizedGroupId = expense.groupId;
    next();
  };
}

export function requirePaymentAccess(paramName = "paymentId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const paymentId = paramId(req, paramName);
    if (paymentId === null) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    const [payment] = await db
      .select({ id: paymentsTable.id, groupId: paymentsTable.groupId })
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId));
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (!(await isMember(payment.groupId, userId))) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    req.authorizedGroupId = payment.groupId;
    next();
  };
}

export function requireGroupMemberByMember(paramName = "memberId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.dbUserId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const memberId = paramId(req, paramName);
    if (memberId === null) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    const [target] = await db
      .select({ id: groupMembersTable.id, groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.id, memberId));
    if (!target) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    if (!(await isMember(target.groupId, userId))) {
      res.status(404).json({ error: "Member not found" });
      return;
    }
    req.authorizedGroupId = target.groupId;
    next();
  };
}
