# Encrypted Code Execution State — Design Plan

## The problem

Code-exec containers get evicted but `/workspace` state needs to survive — encrypted such that Tinfoil can't read it, and without sending it to the client every time (could be too big).

## Code execution

How the underlying code-execution pipeline works (orchestrator, sandbox, session mapping, wire headers) lives in [overview.md](./overview.md). Everything below assumes that as the substrate.

## The unit of state

A tar of `/workspace`. Long-running processes ignored.

## The two keys

**User keypair (X25519).** Derived deterministically from the user's passkey via WebAuthn PRF + HKDF — same ceremony as chat encryption, different `info` label (`"tinfoil-exec-snapshot-v1"`). The 32 bytes out of HKDF are the X25519 private key directly (Curve25519 has no key-validation pass). Pubkey is shared freely; privkey lives briefly in webapp memory and is re-derived on demand.

One synced passkey per user → one pubkey, one wrap.

**DEK (AES-256).** Fresh per snapshot, single-use, generated inside the container. Encrypts the tar (bulk data); the container wraps it under the user's pubkey before storage. Standard hybrid encryption.

## Identity per chat

`X-Session-Id` carries `chat.id`. Same value drives the orchestrator session map and the `/api/storage/exec-snapshot/{sessionId}` URL. Storage rows scoped per Clerk user (see [auth.md](./auth.md)).

We considered a separate unguessable `execSessionId` for b2b, but b2b inference is currently stateless (state is client-side), so deferred.

## The flow, end-to-end

**Chat open:** webapp re-derives the X25519 keypair, fetches the wrappedDEK for `chat.id` if any, unwraps with privkey, holds the plaintext DEK in memory.

**Code execution request:** webapp sends the tool call through the router with `X-Session-Id`, the pubkey (always — for any future snapshot), and the DEK (only on cold resume).

**Orchestrator `GetOrAssign`:** in-memory miss → fresh container from warm pool. If a resume DEK is present, fetch the ciphertext from storage, decrypt, push tar into `/workspace` before exposing the container to traffic. Otherwise empty. Restore happens only at assign time — there's no public `/restore` endpoint, which kills the "attacker uploads attacker-controlled tar" class.

**Container** runs the tool call as today; caches the user pubkey from the request header for later.

**Eviction (10 min idle):** orchestrator calls the container's new `POST /snapshot`. Container generates a fresh DEK, AES-GCM-encrypts a tar of `/workspace`, wraps the DEK with the cached pubkey, returns `{ciphertext, wrappedDEK}`. Orchestrator PUTs to `/api/storage/exec-snapshot/{sessionId}` and destroys the container.

**Next chat open:** back to the top.

## Trust model

Chained attestation: webapp → router → orchestrator → container, each link verifying the next. Orchestrator is the trust anchor for the resume handshake — the client doesn't learn each container's attestation key separately. (`VERIFY_ATTESTATION` defaults off in the orchestrator today; flips on in prod.)

## Storage layout

- `PUT /api/storage/exec-snapshot/{sessionId}` — orchestrator writes `{ciphertext, wrappedDEK}` as one bundle. (`sessionId == chat.id` for webapp traffic.)
- `GET /api/storage/exec-snapshot/{sessionId}` — webapp fetches just the wrappedDEK on chat open; orchestrator fetches the full bundle on resume.

One storage record so ciphertext and wrappedDEK can't desync. Auth in [auth.md](./auth.md).

## Misc. Decisions

- One passkey per user, synced. Single pubkey, single wrap, no registry.
- No `/restore` endpoint on the executor — restore is internal to `GetOrAssign`.
- Snapshots not deleted for v1.
- Code execution is webapp-only (Clerk-authed). See [auth.md](./auth.md).
- `chat.id` is the storage key (passed as `X-Session-Id`).
- Wire protocol keeps a generic `sessionId` name so a future partner path can plug in.
- FK on `exec_snapshots.id` → `chats(id) ON DELETE CASCADE` so deleting a chat GCs its snapshot.
- No size cap. See how it looks in practice.
- Decryption-failure handling — mirror the existing `decryptionFailed` pattern from the chat path.

## What needs to be built, by repo

_Repos are local under `/Users/dmccanns/Desktop/Tinfoil/`, all checked out to `dmccanns/code-exec`._

**tinfoil-webapp:** send `chat.id` as `X-Session-Id`; HKDF the X25519 keypair off the PRF master; on chat open fetch+unwrap the DEK; send DEK (if any) and pubkey on code-exec requests; hide the code-exec toggle for signed-out users.

**confidential-code-execution (orchestrator):** restore-on-assign in `Manager.GetOrAssign` (resume DEK + bundle → push tar before exposure); eviction snapshot via container's `/snapshot` → PUT bundle; cache user pubkey on the session→container map; per-sessionId serialization so racing tabs don't double-restore; flip `VERIFY_ATTESTATION` in prod.

**code-execution-environment (executor):** new `POST /snapshot` (tar `/workspace`, generate DEK, AES-GCM-encrypt, wrap DEK under provided pubkey, return bundle); internal mechanism (not a public endpoint) for the orchestrator to drop a tar into `/workspace` before exposure.

**controlplane (api.tinfoil.sh):** new `PUT/GET /api/storage/exec-snapshot/{sessionId}`; opaque bytes; rows scoped per Clerk user; FK with `ON DELETE CASCADE`. Auth model in [auth.md](./auth.md).

_Manual end-to-end test once everything's running locally._
