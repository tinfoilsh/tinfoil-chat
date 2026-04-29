# Encrypted Code Execution State — Design Plan

## The problem

Code execution containers can't run forever. At some point we have to evict them, which means the user's `/workspace` state has to go somewhere. But we need the same encryption guarantee we have everywhere else: Tinfoil cannot open it. We can't send it back to the client every time, because the state could be too big. And we don't have access to the user's encryption key inside the container, which is good — that's the whole point.

## What's there today

The full request flow is:

**webapp → confidential-model-router → confidential-code-execution (orchestrator) → code-execution-environment (sandbox)**

The orchestrator already maintains a warm pool of containers and maps an `X-Session-Id` (currently just the chat ID, a `reverseTs_uuidv4`) to a container. The sandbox is a stateless bash runner with `/exec`, `/read`, `/write` against `/workspace`. No persistence anywhere. Every container is its own little trust boundary — a fresh enclave per session, which is reasonable.

## The unit of state

A tar of `/workspace`. We're going to ignore any long-running processes — we don't really allow them anyway, so it's just tar.

## The two keys

This is the part that took the longest to settle, and once it clicks the rest falls out:

**The user's keypair (X25519, asymmetric).** Derived deterministically from the user's passkey via the WebAuthn PRF extension and HKDF. The same passkey ceremony the webapp already runs to unlock chat encryption — we just add a second `info` label (`"tinfoil-exec-snapshot-v1"`) and HKDF a different 32 bytes out of the same PRF master. Those 32 bytes are the X25519 private key directly (no prime-finding, just bytes-as-key — that's the trick of Curve25519). Multiplying the curve base point by the private key gives the public key. One passkey, two derived secrets, both rooted in the same user-verification ceremony.

The pubkey is shared freely. The privkey lives only briefly in webapp memory and is re-derived on demand. Nothing private is ever persisted or sent over the wire.

We assume one synced passkey per user. If hardware keys ever become a thing, we'd add a controlplane pubkey registry — but that's a v2 problem, and the on-disk format wouldn't have to change (just an array of wrappedDEKs instead of one).

**The DEK (AES-256, symmetric).** Generated brand new by the container _each time it takes a snapshot_. Single-use. There's only one of them (not a pair) and a new one per snapshot. Used to encrypt the tar (the bulk data). The DEK itself is small, so the container wraps it under the user's pubkey before storage. The wrapped result — the "wrappedDEK" — sits in storage alongside the ciphertext tar.

This is just standard hybrid encryption. Symmetric is fast and works on big data, asymmetric is what we use to deliver the key.

## Identity per chat

Each chat gets a separate, client-generated `execSessionId` — 16 bytes from `crypto.getRandomValues`, base64url-encoded. Stored as metadata on the chat record, sent as `X-Session-Id` on requests. Kept distinct from `chat.id` (which still does its existing sort-key job with the reverse timestamp). The exec session ID is the storage key for the snapshot blob, so the controlplane never sees a direct chat-id ↔ exec-snapshot correlation.

## The flow, end-to-end

**Chat open:**

- Webapp re-derives the user's X25519 keypair from the passkey.
- Webapp checks `/api/storage/exec-snapshot/{execSessionId}` for an existing snapshot.
- If one exists: fetch just the small wrappedDEK part, unwrap with the privkey, hold the plaintext DEK in memory.

**Code execution request:**

- Webapp sends the tool call through the router.
- Headers carry: `X-Session-Id`, the user's pubkey (so any future snapshot can wrap to it), and — _if_ this is a cold resume — the unwrapped DEK.

**Orchestrator `GetOrAssign`:**

- In-memory miss → pull fresh container from warm pool.
- If a resume DEK is in the request, fetch the ciphertext tar from storage, decrypt with the DEK, push the tar into the container's `/workspace`. Then mark assigned.
- If no resume DEK and no snapshot exists, just assign a fresh empty container.
- Restore happens only as the first thing during assignment. There is no public `/restore` endpoint — cleaner that way, kills a class of "attacker uploads attacker-controlled tar" problems.

**Container handles the tool call** like it does today. Caches the user pubkey from the request header for later use.

**Eviction:**

- Orchestrator calls the container's new `POST /snapshot`.
- Container generates a fresh random DEK, AES-GCM-encrypts a tar of `/workspace`, wraps the DEK with the cached user pubkey, returns `{ciphertext, wrappedDEK}`.
- Orchestrator PUTs the bundle to `/api/storage/exec-snapshot/{execSessionId}`.
- Container is destroyed.

_evection happens after 10 minutes with no tools to that container_

**Next chat open**, we're back at the top, and the new wrappedDEK gets fetched and unwrapped.

## Trust model

Chained attestation: webapp → router → orchestrator → container, each link verifying the next. The orchestrator is the trust anchor for the resume handshake — the client doesn't have to learn each container's attestation key separately. This is how it already is!

`VERIFY_ATTESTATION` defaults to false in the orchestrator today for testing (will change in prod dw!)

## Storage layout

New controlplane endpoint, mirroring the existing attachment/conversation pattern:

- `PUT /api/storage/exec-snapshot/{execSessionId}` — orchestrator writes `{ciphertext, wrappedDEK}` as one bundle.
- `GET /api/storage/exec-snapshot/{execSessionId}` — webapp fetches just the wrappedDEK on chat open; orchestrator fetches the full bundle on resume.

The bundle is one storage record so ciphertext and wrappedDEK can't get out of sync.

## Misc. Decisions

- One passkey per user, synced across devices. Single pubkey, single-wrap, no registry.
- No `/restore` endpoint on the executor. Restore is internal to the orchestrator's `GetOrAssign`.
- Snapshots are not deleted for v1.
- Unauthenticated users don't get snapshots. Webapp gates this client-side.
- `execSessionId` (not `chat.id`) is the storage key.
- Client-side generation for the exec session ID, 16 bytes of `crypto.getRandomValues`.
- Snapshot deletion/time stored should be the same as chats. Should be linked to chat.
- No size cap. We'll see how this looks in practice.
- Decryption-failure handling — mirror the existing `decryptionFailed` pattern from the chat path.

## What needs to be built, by repo

_Note: all the repoes are local, in /Users/dmccanns/Desktop/Tinfoil/. They should all be checked out to ~dmccanns/code-exec already_

**tinfoil-webapp:**

- Generate `execSessionId` client-side, store on the `StoredChat` record, send as `X-Session-Id`.
- Add HKDF derivation with `info="tinfoil-exec-snapshot-v1"` off the existing PRF master to produce the X25519 keypair.
- On chat open: check for snapshot, fetch wrappedDEK, unwrap, hold the DEK in memory.
- Send the DEK (if exists) and the pubkey (always) in the headers of code-exec requests.
- Block code execution for unauthenticated users - make it not even an option in the UI.

**confidential-code-execution (orchestrator):**

- Restore-on-assign inside `Manager.GetOrAssign`: read the resume DEK and snapshot bundle, push tar into the fresh container's `/workspace` before exposing it to traffic.
- Eviction snapshotting: call the container's `/snapshot`, PUT the returned bundle to the controlplane.
- Cache the user pubkey from the session-start request, keep alongside the session→container map.
- Per-`execSessionId` serialization so two concurrent webapp tabs don't both spin up a restored container.
- Flip `VERIFY_ATTESTATION` on in prod.

**code-execution-environment (executor):**

- New `POST /snapshot`: tar `/workspace`, generate DEK, AES-GCM-encrypt, wrap DEK under the provided pubkey, return the bundle.
- An internal mechanism (not a public endpoint) for the orchestrator to drop a tar into `/workspace` before the container is exposed.

**controlplane (api.tinfoil.sh):**

- New `PUT/GET /api/storage/exec-snapshot/{execSessionId}` endpoint. Same auth and scoping pattern as the existing attachment endpoint. Treats payload as opaque bytes.

_Once finished, we'll test manually by running everything_
