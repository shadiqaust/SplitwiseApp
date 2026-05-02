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
- `src/components/add-expense-with-friend-dialog.tsx` (web) / `components/AddExpenseWithFriendModal.tsx` (mobile) — shared dialog/modal that posts a non-group friend expense via `POST /api/expenses` (used by both Friends tab and Dashboard CTA). Both web and mobile accept `friends: FriendLike[]` (one or many) and support equal-split for any N participants. "Exact amounts" mode is allowed only when there's a single friend.
- `src/components/add-expense-cta.tsx` (web) / `components/AddExpenseCTA.tsx` (mobile) — "Add expense" button on the Dashboard. Opens a friend picker (search + scrollable list of `/api/friends` results, cache key `["friends"]` / `["friends-mobile"]` shared with the Friends tab). Both web and mobile pickers are **multi-select** with checkmark indicators and a "Next (n)" button. Mobile modals additionally have a top "Cancel" text button and respect device safe area.

### Non-group expense API (`POST /api/expenses`)
Body: `{ friendUserId? | friendUserIds?: string[], description, totalAmount, currency, splitType, paidByUserId, date, splits }`. Either `friendUserId` (single, legacy) or `friendUserIds` (one or more) must be provided. Backend validates all are friends, payer is one of `{me, ...friends}`, and splits cover every participant exactly once. Multi-friend (`friendUserIds.length > 1`) is restricted to `splitType: "equal"`.

### Non-group expense history (`GET /api/expenses/non-group`)
Returns `{ myNetBalance, count, expenses }` for every expense with `groupId IS NULL` involving the current user (as payer or in the splits). Surfaced as a virtual "Non-group expenses" card at the top of the Groups tab on both web (`/non-group-expenses` route in `pages/non-group-expenses.tsx`) and mobile (`app/non-group-expenses.tsx` route, linked from `app/(tabs)/groups/index.tsx`). The screens render a balance summary plus per-expense rows with "you lent" / "you owe" labels.

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

### Expense Detail page + comments

Every expense row across the apps is clickable and routes to a dedicated Expense Detail screen.

- Web route: `/expenses/:expenseId` → `artifacts/splitwise-web/src/pages/expense-detail.tsx`. Wired sites: `friend-detail.tsx`, `non-group-expenses.tsx`, `group-detail.tsx` (inline expense Card).
- Mobile route: `app/expenses/[id].tsx`. Wired sites: `friends/[friendId].tsx`, `non-group-expenses.tsx`, `(tabs)/groups/[id].tsx`.
- Detail page shows: description, total, who paid, date, category, group/non-group label, per-person split breakdown (with "(paid)" tag and percentage when present), and a comments thread.
- Comments thread: list (oldest→newest), add (Cmd/Ctrl+Enter on web), delete-own only. Authors are returned as `{ id, name, email, avatarUrl }`.
- Backend: `expense_comments` table (FK to `expenses` cascade) in `lib/db/src/schema/expenses.ts`. Endpoints in `artifacts/api-server/src/routes/expenses.ts`: `GET /expenses/:expenseId/comments`, `POST /expenses/:expenseId/comments` (body trimmed, max 2000 chars), `DELETE /expenses/:expenseId/comments/:commentId` (UUID-validated, author-only 403). All gated by `requireExpenseAccess()`. Deleting an expense also clears its comments (via FK cascade; explicit delete kept for safety).

## Expense edit + receipt photo (May 2026)

Full expense edit (group + non-group) and optional receipt photo upload per expense.

### Object storage
- `artifacts/api-server/src/lib/{objectStorage,objectAcl}.ts` — GCS client + ACL helpers (Replit App Storage).
- `artifacts/api-server/src/routes/storage.ts` — three endpoints, mounted under `/api`:
  - `POST /storage/uploads/request-url` — **gated by `requireAuth`**; returns `{ uploadUrl, objectPath }` where `objectPath = /objects/uploads/<uuid>`.
  - `GET /storage/objects/*path` — fetch a private object (currently unauthenticated; receipt URLs are UUID-obscured — acceptable for low-risk receipts).
  - `GET /storage/public-objects/{filePath}` — public asset passthrough.
- Required env: `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` (already set).

### DB
- `expensesTable.photoUrl text` (nullable) — added in `lib/db/src/schema/expenses.ts`. Pushed.

### Backend `PUT /api/expenses/:expenseId`
- `requireExpenseAccess()` gates the route.
- Supports group **and** non-group expenses. For non-group, allowed participants are derived from existing `expense_splits` rows ∪ `paidByUserId`.
- Accepts partial updates of `description`, `category`, `date`, `totalAmount`, `currency`, `splitType`, `paidByUserId`, `splits`, `photoUrl`.
- Invariant: when `splits` are provided, `paidByUserId` **must** appear in `splits[].userId` (otherwise 400 "Payer must be included in the split participants").
- Splits are recomputed via `computeFinalSplits(splitType, total, splits)` then replaced atomically (delete-then-insert).

### OpenAPI
- `Expense` and `UpdateExpenseBody` include `photoUrl?: string | null`.
- `/storage/uploads/request-url` declares `security: [{ bearerAuth: [] }]` and `401` response.
- `pnpm --filter @workspace/api-spec run codegen` regenerates `useRequestUploadUrl` and updated typings.

### Web edit page
- Route `/expenses/:expenseId/edit` → `artifacts/splitwise-web/src/pages/expense-edit.tsx`.
- "Edit" button on `expense-detail.tsx` navigates here.
- Single-page form: description, amount, category, date, paidBy, splitType (equal/exact/percentage), participants checklist, receipt photo.
- Hydration via a `hydrated` flag from `useGetExpense` + `useGetGroup` (group only when `expense.groupId`). `useGetGroup` is called with `query: { queryKey: getGetGroupQueryKey(groupId), enabled: Boolean(expense?.groupId) }`.
- Payer is **locked into participants**: `changePayer()` auto-adds the new payer to the participant set; `toggleParticipant()` is a no-op for the current payer.
- `src/lib/upload.ts` — `uploadPhoto(file)` (POST request URL, PUT to presigned URL, return `objectPath`) and `photoSrc(objectPath)` (returns `/api/storage<objectPath>` for `<img>`).
- On save, invalidates: `getGetExpenseQueryKey(id)`, `getListExpensesQueryKey()`, `getGetActivityQueryKey()`, `getGetDashboardSummaryQueryKey()`, and group balances when applicable.

### Mobile edit screen
- Route `/expenses/edit/[id]` → `artifacts/splitwise-mobile/app/expenses/edit/[id].tsx`. Same form/logic as web.
- "Edit" button on `app/expenses/[id].tsx`. Receipt thumbnail rendered on the detail screen too.
- `lib/upload.ts` — `uploadPhotoFromUri(uri)` (uses `FileSystem.uploadAsync` BINARY mode against the presigned URL) and `photoUri(objectPath)` (returns `${BASE_URL}/api/storage<objectPath>`).
- Image picking via `expo-image-picker` (already installed). Same payer-in-participants invariant enforced.
- Mobile `Button` component takes `title=` (not children); also has `fullWidth` and `loading` props.

## Soft-delete & confirmation dialogs

### DB schema (lib/db/src/schema)
- Added nullable `deletedAt: timestamp("deleted_at")` to: `expensesTable`, `expenseCommentsTable`, `groupsTable`, `groupMembersTable`, `paymentsTable`, `friendshipsTable`. (`expenseSplitsTable` unchanged — child of `expensesTable`, lifecycle follows the parent.)
- Pushed via `pnpm --filter @workspace/db run push`.

### Backend invariants
- **Never hard-delete** primary entities. All `DELETE` route handlers use `db.update(...).set({ deletedAt: new Date() })`.
- **Cascade soft-delete on group**: `DELETE /api/groups/:groupId` also marks the group's expenses, payments, and members as deleted.
- **Re-add re-enables**: re-adding a friend or a group member clears `deletedAt` (via `onConflictDoUpdate` / explicit update).
- **Every read filters deleted rows**: every `SELECT` / `UPDATE` touching the affected tables — including joins, balance/activity calculations, `requireGroupAccess`/`requireExpenseAccess` middleware, `areFriends`, dashboard summary, and friend balance aggregations — adds `isNull(table.deletedAt)`.

### Frontend confirmation UX
- **Web**: shadcn `AlertDialog` (`@/components/ui/alert-dialog`) wraps every destructive button (expense delete, expense-comment delete, payment delete). The trigger is the original button via `asChild`; action button uses `bg-destructive`.
- **Mobile**: `Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress }])` for every destructive action (expense delete in screen header, expense-comment delete, payment delete).
- The legacy "click trash icon twice / Tap delete again" flow has been fully removed.

## Group invite (QR code) flow

### DB schema
- `lib/db/src/schema/groups.ts` — `groupsTable` has `inviteCode: text("invite_code").unique()` (nullable). Generated for new groups; lazy-backfilled for existing groups in `GET /api/groups/:groupId` via `ensureInviteCode()`.
- Code is 10 chars from a Crockford-ish base32 alphabet (no 0/O/1/I/L). Always uppercase.

### Backend (`artifacts/api-server/src/routes/groups.ts`)
- `POST /api/groups` — generates `inviteCode` on creation.
- `GET /api/groups/by-invite/:inviteCode` (auth required) — returns `{ id, name, description, category, avatarUrl, memberCount, alreadyMember }` (preview before joining).
- `POST /api/groups/join` (auth required) — body `{ inviteCode }`. Adds caller as member, or re-enables soft-deleted membership if any. Returns the group.
- `JoinGroupBody` schema lives in `lib/api-spec/openapi.yaml` and is exported from `@workspace/api-zod` after codegen.

### Web (`artifacts/splitwise-web`)
- `qrcode.react` powers `<QRCodeSVG />`. New `InviteQRDialog` lives in `pages/group-detail.tsx`; shown next to "Add member" in the Members card. Encodes `${origin}${BASE_URL}/groups/join/<code>` and shows a copyable link.
- New page `pages/group-join.tsx` mounted at route `/groups/join/:code`; previews the group then calls `useJoinGroup`.
- `pages/auth.tsx` honours `?next=<path>` after sign-in/up so unauthenticated users following an invite link land back on the join page.

### Mobile (`artifacts/splitwise-mobile`)
- `react-native-qrcode-svg` (uses already-installed `react-native-svg`). `InviteQRModal` lives in `app/(tabs)/groups/[id].tsx`; opened by a new QR icon in the screen header. Uses RN's built-in `Share.share` for sharing the link.
- New deep-link screen `app/groups/join/[code].tsx` mirrors the web join page (preview + Join button).
- Both QR codes encode the **web** URL (`https://${EXPO_PUBLIC_DOMAIN}/groups/join/<code>`) so any standard camera/QR scanner can resolve it.

### In-app QR scanner (mobile)
- Mobile app has a built-in QR scanner so users can scan a group invite QR code from inside Splitix and join directly — no need for Universal Links / a real production build.
- Powered by `expo-camera` (`~17.0.x`, SDK 54) using `<CameraView barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={...}>` and the `useCameraPermissions()` hook. Camera permission string is declared in `app.json` under `plugins → expo-camera → cameraPermission`.
- Screen lives at `app/groups/scan.tsx` (route `/groups/scan`). Entry points: header icon button on the Groups tab + a "Scan QR" button next to "New group" at the top of the Groups tab list.
- Scan handler accepts three QR payload formats: a full web URL (`https://.../groups/join/<CODE>`), the deep-link scheme (`splitwise-mobile://groups/join/<CODE>`), or a bare invite code. Code is uppercased and the user is `router.replace()`d to `/groups/join/<CODE>`, which renders the existing `app/groups/join/[code].tsx` preview/join screen.
- Includes camera-permission-denied state with "Open settings" fallback (uses `expo-linking`'s `openSettings()`), a viewfinder overlay, error toast for non-Splitix QR codes, and haptic feedback on success/warning via `expo-haptics`.

### Web → mobile-app deep-link bounce
- Web `pages/group-join.tsx` detects mobile user-agent (`/android|iphone|ipad|ipod/i`) and on mount sets `window.location.href = "splitwise-mobile://groups/join/<code>"`. If the mobile app is installed, the OS hijacks and routes to `app/groups/join/[code].tsx` (expo-router maps the scheme automatically — `scheme: "splitwise-mobile"` in `app.json`). If not installed, the page silently stays on the web fallback.
- The same scheme call is also wired to an "Open in app" button shown on mobile, in case browsers block auto-launch on first visit.
- Universal Links / App Links (proper https → app routing) are NOT yet configured — that requires production domain + Apple Team ID + Android SHA256 fingerprint, available only after first EAS build.

## Web responsive layout (mobile / tablet / desktop)
The web app (`artifacts/splitwise-web`) is fully responsive. Tailwind's default `md` breakpoint (768px) is the dividing line between phone and tablet/desktop:
- **`components/layout.tsx`** — On `<md` viewports, the sidebar is hidden and replaced with: a sticky top header bar (logo + avatar shortcut to `/profile`) and a fixed bottom tab nav (4 icons: Dashboard / Groups / Friends / Profile). Bottom nav respects `env(safe-area-inset-bottom)` for iPhone notches. On `md+`, the original left sidebar is preserved. Main content uses `pb-24 md:pb-8` so the fixed bottom nav never covers content. Sign-out lives only on the Profile page on mobile (the sidebar still shows it on desktop).
- **`index.html`** — viewport meta is `width=device-width, initial-scale=1, viewport-fit=cover` (zoom is allowed for accessibility; `viewport-fit=cover` lets the safe-area env vars work).
- Page-level header rows (`dashboard.tsx`, `groups.tsx`, `friends.tsx`, `friend-detail.tsx`, `non-group-expenses.tsx`, `group-detail.tsx`) use `flex-wrap` with smaller `text-xl`/`text-2xl` h1 sizes on mobile that scale up to `text-3xl` at `sm`/`md`. Action buttons truncate labels (e.g. "Add group" → "Group") on tiny screens.
- Friend list rows on `friends.tsx` stack vertically on `<sm` (avatar+balance row, then full-width action buttons row); on `sm+` they are a single horizontal row.
