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

### Add-expense entry points
- `src/components/add-expense-with-friend-dialog.tsx` (web) / `components/AddExpenseWithFriendModal.tsx` (mobile) — shared dialog/modal that posts a non-group friend expense via `POST /api/expenses` (used by both Friends tab and Dashboard CTA).
- `src/components/add-expense-cta.tsx` (web) / `components/AddExpenseCTA.tsx` (mobile) — "Add expense" button on the Dashboard. Opens a friend picker (search + scrollable list of `/api/friends` results, cache key `["friends"]` / `["friends-mobile"]` shared with the Friends tab). Selecting a friend opens the dialog/modal above.

### Mobile (`artifacts/splitwise-mobile`)
- `lib/auth.tsx` — `AuthProvider` + `useAuth()` hook. Stores JWT in `expo-secure-store` (native) or `localStorage` (web). Exports `getToken()` for the API client.
- `app/sign-in.tsx` — native sign-in / sign-up screen.
- `app/_layout.tsx` — wraps app in `AuthProvider` + `AuthGate` for redirect logic.

### Database schema (`lib/db/src/schema/users.ts`)
- `id` UUID PK
- `name` text
- `email` text (unique)
- `passwordHash` text (bcrypt, 12 rounds)
- `avatarUrl` text (optional)
- `country` text (optional)
- `location` text (optional)
- `createdAt` timestamp

## Avatars (user + group)

Both user and group avatars are stored as **base64 data URLs** directly in the `avatarUrl` column (no object storage). The Express body limit is therefore bumped to **12 MB** in `artifacts/api-server/src/app.ts`.

Clients downscale + JPEG-compress before uploading so payloads stay tiny (~30–80 KB):
- Web (`profile.tsx`, `group-detail.tsx`) — canvas resize to **200×200**, JPEG quality 0.8
- Mobile (`(tabs)/profile.tsx`, `(tabs)/groups/[id].tsx`) — `expo-image-manipulator` resize to **512×512**, JPEG quality 0.7

⚠️ When changing `User`, `Group`, `UpdateUserBody`, or `UpdateGroupBody` always edit `lib/api-spec/openapi.yaml` and re-run `pnpm --filter @workspace/api-spec run codegen`. The server's Zod `safeParse` silently strips fields missing from the schema, which means an apparently successful PUT can be a no-op — that's the failure mode the avatar-update fix resolved.

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

### Adding a member to a group with existing expenses

After a member is added, both web (`AddMemberDialog` in `artifacts/splitwise-web/src/pages/group-detail.tsx`) and mobile (`onAddMember` in `artifacts/splitwise-mobile/app/(tabs)/groups/[id].tsx`) prompt the user: **"Include {name} in past expenses?"**

If the user confirms, they call `POST /api/groups/:groupId/expenses/include-member` (handler in `artifacts/api-server/src/routes/groups.ts`) with `{ userId }`. The handler:

- Wraps everything in a single DB transaction.
- For each `equal`-split expense in the group: deletes existing splits and re-inserts new ones using the same penny-distribution algorithm as `computeFinalSplits`, with the new user appended.
- **Skips** `exact` and `percentage` splits — those have user-entered amounts/percentages that should not be silently changed; the response includes `skippedNonEqualCount` so the UI can tell the user.
- Skips expenses where the user is already in the splits (defensive).
- Returns `{ updatedCount, skippedNonEqualCount, totalCount }`.

After success, both clients invalidate group + balances queries so the recalculated balances appear immediately.

### Non-group friend expenses (no group required)

`expenses.groupId` is **nullable**. Users can add a 1-on-1 expense directly with a friend from the Friends tab on web (`AddExpenseWithFriendDialog` in `artifacts/splitwise-web/src/pages/friends.tsx`) and mobile (`AddExpenseWithFriendModal` in `artifacts/splitwise-mobile/app/(tabs)/friends.tsx`).

- Endpoint: `POST /api/expenses` (handler in `artifacts/api-server/src/routes/expenses.ts`) with body `CreateFriendExpenseBody { friendUserId, description, totalAmount, currency, splitType, paidByUserId, splits, date }`. It validates friendship, that the payer is `{me, friend}`, and that splits contain exactly both participants once. Inserts with `groupId: null`.
- `requireExpenseAccess` allows non-group expense access if the user is `paidByUserId` or appears in `expenseSplits`; `req.authorizedGroupId` is left unset for null-group expenses.
- `PUT /api/expenses/:id` rejects edits to non-group expenses with `400` (editing not yet supported); `payments.groupId` is still `notNull`, so settle-up for non-group expenses is also not yet supported.
- Friend balances (`/api/friends`) and dashboard summary (`/api/dashboard/summary`) both aggregate non-group expenses (`groupId IS NULL`) in addition to group expenses; the dashboard correctly handles users with zero group memberships but existing friend expenses.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
