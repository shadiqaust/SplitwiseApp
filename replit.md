# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

This workspace hosts **Splitix** (a Splitwise-style shared-expense app). The app folders keep their original `splitwise-*` names as internal identifiers; the user-facing brand everywhere is **Splitix**.

- `artifacts/splitwise-web` — React + Vite + Tailwind v4 web app served at `/`
- `artifacts/splitwise-mobile` — Expo Router 6 mobile app served at `/mobile`
- `artifacts/api-server` — Express 5 + Drizzle + Postgres API at `/api`
- `lib/db` — Drizzle schema (users, groups, group_members, expenses, expense_splits, payments). All primary keys and foreign keys are **UUID v4** (`uuid("id").defaultRandom()`).
- `lib/api-spec` — OpenAPI source-of-truth used to generate clients and Zod schemas
- `lib/api-client-react` — generated TanStack Query hooks (orval) consumed by web + mobile
- `lib/api-zod` — generated Zod request/response validators consumed by the API server

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Auth**: Custom JWT + bcrypt backed by PostgreSQL (no third-party auth provider)
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

## Auth System

Custom JWT-based authentication — no Clerk or third-party provider.

### API endpoints
- `POST /api/auth/register` — `{ name, email, password }` → `{ token, user }`
- `POST /api/auth/login` — `{ email, password }` → `{ token, user }`
- `POST /api/auth/logout` — stateless (token invalidation is client-side)

### Server middleware
- `requireAuth` (`artifacts/api-server/src/middlewares/requireAuth.ts`) — validates `Authorization: Bearer <jwt>` header, looks up the user in the DB, attaches `req.dbUserId`
- `artifacts/api-server/src/lib/jwt.ts` — `signToken(payload)` / `verifyToken(token)` using `jsonwebtoken`. Secret from `JWT_SECRET` env var (falls back to dev secret in development).

### Web (`artifacts/splitwise-web`)
- `src/lib/auth.tsx` — `AuthProvider` + `useAuth()` hook. Stores JWT + user in `localStorage`. Calls `setAuthTokenGetter` on the shared API client so all requests include `Authorization: Bearer <token>`.
- `src/pages/auth.tsx` — custom sign-in / sign-up forms, no external dependencies.

### Mobile (`artifacts/splitwise-mobile`)
- `lib/auth.tsx` — `AuthProvider` + `useAuth()` hook. Stores JWT in `expo-secure-store` (native) or `localStorage` (web). Exports `getToken()` for the API client.
- `app/sign-in.tsx` — native sign-in / sign-up screen.
- `app/_layout.tsx` — wraps app in `AuthProvider` + `AuthGate` for redirect logic.

### Database schema (`lib/db/src/schema/users.ts`)
- `id` serial PK
- `name` text
- `email` text (unique)
- `passwordHash` text (bcrypt, 12 rounds)
- `avatarUrl` text (optional)
- `createdAt` timestamp

## API auth & authorization

- `requireAuth` — verifies JWT, attaches `req.dbUserId`
- `requireGroupMember` / `requireExpenseAccess` / `requirePaymentAccess` / `requireGroupMemberByMember` (in `artifacts/api-server/src/middlewares/requireGroupAccess.ts`) enforce that the authenticated user is a member of the relevant group; they attach `req.authorizedGroupId`. Every group-, expense-, and payment-scoped route uses one of these guards.

## API client wiring

- Generated URLs from `lib/api-client-react/src/generated/api.ts` already include the `/api` prefix, so callers must set the base URL to the **origin only** (no `/api` suffix).
- Web: `AuthProvider` calls `setBaseUrl(window.location.origin)` and `setAuthTokenGetter(() => token)` on mount.
- Mobile: `configureApi(() => getToken())` in `app/_layout.tsx` wires the token getter; base URL is `https://${EXPO_PUBLIC_DOMAIN}`.

## Split / payment math

`computeFinalSplits` in `artifacts/api-server/src/routes/expenses.ts` is the single backend authority for splits — it works in integer cents:

- `equal` — distributes the leftover penny across the first N participants so the per-cent sum always matches the total.
- `exact` — rejects the request if rounded-cent amounts don't sum to the total.
- `percentage` — rejects the request if percentages don't sum to 100; the last participant absorbs any rounding residual.

All POST/PUT routes also validate that `paidByUserId` and every split `userId` are members of the group. Payments validate that `fromUserId !== toUserId` and both users are members.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
