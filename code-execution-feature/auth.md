# Code-Exec Auth

How JWT and admin auth split across the four services for the encrypted
snapshot feature. Three rules cover almost everything:

1. **Code execution is webapp-only.** Every session must bind to a verified
   Clerk user. Bare API keys (`tk_*`) are rejected at the orchestrator.
2. **Snapshot GET is JWT-only.** Both consumers (webapp on chat reopen,
   orchestrator on restore-during-live-request) hold a fresh user JWT.
3. **Snapshot PUT is admin-only.** Eviction runs minutes after the user
   request returns; the JWT has expired. The orchestrator authenticates
   as admin and uses `X-On-Behalf-Of: <clerk_user_id>` to attribute the
   row.

## Request flow

```
webapp ──► router ──► orchestrator ──► controlplane
       (forwards)   (binds + gates)    (verifies + stores)
```

**Headers in flight (webapp → orchestrator):**

| Header                              | Set by                    | Used by                               |
| ----------------------------------- | ------------------------- | ------------------------------------- |
| `Authorization: Bearer <Clerk JWT>` | webapp                    | orchestrator (whoami + GET)           |
| `X-Session-Id: <chat.id>`           | webapp                    | orchestrator (session map key)        |
| `X-Exec-Pubkey: <X25519 pub>`       | webapp                    | orchestrator (eviction-time DEK wrap) |
| `X-Exec-Resume-Dek: <dek>`          | webapp (chat reopen only) | orchestrator (restore decrypt)        |

The router forwards all four verbatim to the orchestrator's MCP endpoint
(`confidential-model-router/toolruntime/runtime.go`). It validates none
of them — the router stays a dumb pipe.

## Orchestrator: session → user binding

On every `tools/call`, the orchestrator's MCP handler:

1. Extracts the bearer from `Authorization`.
2. Calls `AuthorizeSession(sessionID, bearer)`:
   - Hashes the bearer.
   - If `(sessionID, bearer-hash)` is already in the binding cache → trust
     it (no network hop).
   - Otherwise calls controlplane `GET /api/auth/whoami` with the bearer.
     - 200 + `clerk_user_id` → bind / verify the session.
     - 401 → reject the request (not a Clerk JWT).
3. If the resolved `clerk_user_id` mismatches an existing session
   binding → 403 (cross-user proxy attack blocked).

Steady-state cost is a map lookup. Whoami fires on first call per session
and on JWT refresh.

## Snapshot endpoints (controlplane)

`PUT /api/storage/exec-snapshot/:id` — **admin only**, must set
`X-On-Behalf-Of: <clerk_user_id>`. Reject:

- JWT-authed callers (403 — webapp can't write snapshots)
- Admin without the header (400 — no silent fallback to admin's own user)

`GET /api/storage/exec-snapshot/:id` — **JWT only**. Reject:

- Admin-authed callers (403)
- JWT callers that try to set `X-On-Behalf-Of` (400)

Row scoping is by `(clerk_user_id, id)` — the user the JWT subject
identifies on GET, the user named in `X-On-Behalf-Of` on PUT.

`GET /api/auth/whoami` — JWT only. Returns `{clerk_user_id}` from
`claims.Subject`. Used by the orchestrator to verify Clerk JWTs without
embedding the Clerk SDK itself.

## End-to-end

**Tool call (no resume):**

1. Webapp sends Clerk Bearer + `X-Session-Id` + pubkey to router.
2. Router forwards to orchestrator MCP.
3. Orchestrator calls controlplane `whoami`, binds session.
4. Tool call runs. Pubkey cached on container for eviction.

**Chat reopen with snapshot:**

1. Webapp `GET /api/storage/exec-snapshot/:id` with its Clerk JWT →
   controlplane returns bundle scoped to the JWT subject.
2. Webapp unwraps the wrapped DEK with its X25519 privkey → plaintext DEK.
3. Webapp sends `X-Exec-Resume-Dek: <dek>` on the next code-exec request.
4. Orchestrator binds session as above, then `GET`s the bundle from
   controlplane **with the user's JWT** (still fresh — same request).
5. Orchestrator decrypts ciphertext, pushes plaintext tar to container's
   `/restore`.

**Eviction (idle 10+ min):**

1. Orchestrator asks the container for `{ciphertext, wrappedDEK}` (DEK
   wrapped to the cached pubkey).
2. Orchestrator `PUT`s the bundle to controlplane with **admin auth +
   `X-On-Behalf-Of: <clerk_user_id>`** (looked up from the session
   binding).
3. Container destroyed.

## Why orchestrator-validates instead of router-validates

The router doesn't know Clerk. It just forwards. The orchestrator uses controlplane to validate, matching the current pattern for stored user chats

## Why split PUT and GET

Different actors, different fresh-JWT availability:

- **PUT** is async (eviction loop). The user's JWT expired 10+ minutes
  ago. Admin auth is the only option, and we use `X-On-Behalf-Of` to
  preserve user attribution.
- **GET** is sync (live request). The user's JWT is fresh; we use it.
  Admin GET would let anyone with the admin key read any user's bundle —
  unnecessary blast radius for no win.

## What got built, by repo

- **`tinfoil-webapp`** — nothing. Header set was already correct.
- **`confidential-model-router`** — forward `X-Exec-Pubkey` and
  `X-Exec-Resume-Dek` through the MCP `headerRoundTripper`. (`Authorization`
  - `X-Session-Id` were already forwarded.)
- **`code-execution/confidential-code-execution`** —
  - `auth.go` (new): `AuthorizeSession`, `whoami`, identity binding.
  - `mcp.go`: gate every `tools/call` on `AuthorizeSession`.
  - `snapshot.go`: `fetchSnapshotBundle` uses user JWT;
    `putSnapshotBundle` uses admin + `X-On-Behalf-Of`.
  - `manager.go`: `identities` map cleaned up on session
    cleanup/eviction; identity looked up at PUT time.
- **`controlplane`** —
  - `handlers/auth_handler.go` (new): `Whoami`.
  - `handlers/exec_snapshot_handler.go`: `resolvePutIdentity` (admin only)
    and `resolveGetIdentity` (JWT only).
  - `main.go`: snapshot routes mounted under `combinedAuth`; whoami
    behind `requireJWT`.
  - `middleware/middleware.go`: `SetTestAuthLocals` test helper.
