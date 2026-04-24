# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

This workspace hosts a **Splitwise clone**:

- `artifacts/splitwise-web` — React + Vite + Tailwind v4 + Clerk web app served at `/`
- `artifacts/splitwise-mobile` — Expo Router 6 mobile app served at `/mobile`
- `artifacts/api-server` — Express 5 + Drizzle + Postgres API at `/api`
- `lib/db` — Drizzle schema (users, groups, group_members, expenses, expense_splits, payments)
- `lib/api-spec` — OpenAPI source-of-truth used to generate clients and Zod schemas
- `lib/api-client-react` — generated TanStack Query hooks (orval) consumed by web + mobile
- `lib/api-zod` — generated Zod request/response validators consumed by the API server

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Auth**: Clerk (web: `@clerk/react`, mobile: `@clerk/clerk-expo` + `expo-secure-store`)
- **API framework**: Express 5 (mounted at `/api`)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## API auth & authorization

- `requireAuth` (in `artifacts/api-server/src/middlewares/requireAuth.ts`) verifies the Clerk session and looks up / auto-provisions the corresponding `users` row, attaching `req.dbUserId`. If a placeholder user already exists for the email (created by an invite), it links it to the new `clerkId` instead of creating a duplicate row.
- `requireGroupMember` / `requireExpenseAccess` / `requirePaymentAccess` / `requireGroupMemberByMember` (in `artifacts/api-server/src/middlewares/requireGroupAccess.ts`) enforce that the authenticated user is a member of the relevant group; they attach `req.authorizedGroupId`. Every group-, expense-, and payment-scoped route uses one of these guards.

## API client wiring

- Generated URLs from `lib/api-client-react/src/generated/api.ts` already include the `/api` prefix, so callers must set the base URL to the **origin only** (no `/api` suffix).
- Web: `artifacts/splitwise-web/src/lib/queryClient.ts` calls `setBaseUrl(window.location.origin)` and exposes `configureAuth(getToken)` which is invoked from `App.tsx` with Clerk's `useAuth().getToken`.
- Mobile: `artifacts/splitwise-mobile/lib/api.ts` exports `configureApi(getToken)` which sets the base URL to `https://${EXPO_PUBLIC_DOMAIN}` and wires Clerk's token getter; `app/_layout.tsx` calls it from inside the `ClerkProvider`.

## Split / payment math

`computeFinalSplits` in `artifacts/api-server/src/routes/expenses.ts` is the single backend authority for splits — it works in integer cents:

- `equal` — distributes the leftover penny across the first N participants so the per-cent sum always matches the total.
- `exact` — rejects the request if rounded-cent amounts don't sum to the total.
- `percentage` — rejects the request if percentages don't sum to 100; the last participant absorbs any rounding residual.

All POST/PUT routes also validate that `paidByUserId` and every split `userId` are members of the group. Payments validate that `fromUserId !== toUserId` and both users are members.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
