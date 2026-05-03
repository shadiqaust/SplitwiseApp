import type { NextFunction, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  expensesTable,
  expenseSplitsTable,
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
        isNull(groupMembersTable.deletedAt),
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
      .select({
        id: expensesTable.id,
        groupId: expensesTable.groupId,
        paidByUserId: expensesTable.paidByUserId,
        createdByUserId: expensesTable.createdByUserId,
      })
      .from(expensesTable)
      .where(and(eq(expensesTable.id, expenseId), isNull(expensesTable.deletedAt)));
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    if (expense.groupId !== null) {
      // Group expense: must be a member of the group.
      if (!(await isMember(expense.groupId, userId))) {
        res.status(404).json({ error: "Expense not found" });
        return;
      }
      req.authorizedGroupId = expense.groupId;
    } else {
      // Non-group (friend) expense: must be a participant — payer, creator,
      // or appear in the splits.
      const isPayer = expense.paidByUserId === userId;
      const isCreator = expense.createdByUserId === userId;
      if (!isPayer && !isCreator) {
        const [mySplit] = await db
          .select({ id: expenseSplitsTable.id })
          .from(expenseSplitsTable)
          .where(
            and(
              eq(expenseSplitsTable.expenseId, expenseId),
              eq(expenseSplitsTable.userId, userId),
            ),
          );
        if (!mySplit) {
          res.status(404).json({ error: "Expense not found" });
          return;
        }
      }
      // No authorizedGroupId for non-group expenses.
    }
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
      .select({
        id: paymentsTable.id,
        groupId: paymentsTable.groupId,
        fromUserId: paymentsTable.fromUserId,
        toUserId: paymentsTable.toUserId,
      })
      .from(paymentsTable)
      .where(and(eq(paymentsTable.id, paymentId), isNull(paymentsTable.deletedAt)));
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (payment.groupId !== null) {
      if (!(await isMember(payment.groupId, userId))) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }
      req.authorizedGroupId = payment.groupId;
    } else {
      // Non-group payment: must be from or to the current user.
      if (payment.fromUserId !== userId && payment.toUserId !== userId) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }
    }
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
      .where(and(eq(groupMembersTable.id, memberId), isNull(groupMembersTable.deletedAt)));
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
