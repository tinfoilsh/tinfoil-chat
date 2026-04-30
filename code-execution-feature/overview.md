# Code Execution

How the code-execution feature is wired across services, independent of the snapshot/state work in [snapshot.md](./snapshot.md) and the auth split in [auth.md](./auth.md).

## Pipeline

```
webapp → confidential-model-router → confidential-code-execution (orchestrator) → code-execution-environment (sandbox)
```

The webapp opts in per-request via `code_execution_options: {}` on chat completions. When that flag is set, the router activates its `code_execution` tool profile and runs an MCP tool loop against the orchestrator on top of the model stream.

## Orchestrator

`confidential-code-execution` maintains a warm pool of attested containers and a session map. On a tool call:

- `Manager.GetOrAssign(sessionID)` returns the container bound to this session, or pulls a fresh one from the warm pool and assigns it.
- The session ID is whatever the caller put in `X-Session-Id`. The webapp uses `chat.id` (a `reverseTs_uuidv4`).
- Per-`sessionID` serialization keeps two racing tabs from each grabbing a separate container for the same chat.
- `VERIFY_ATTESTATION` flips on in prod; off locally for dev.

The orchestrator exposes an MCP-style HTTP server (`POST /mcp`) plus admin endpoints (`/cleanup`, `/finish`, `/health`, `/metrics`).

## Sandbox

`code-execution-environment` is a stateless bash runner over `/workspace`:

- `POST /exec` — run a bash command, return stdout/stderr/exit code.
- `POST /read` / `POST /write` — file IO inside `/workspace`.

Each container is its own trust boundary — a fresh enclave per session. No persistence by default; that's what the snapshot work in [snapshot.md](./snapshot.md) layers on.

## Tools surfaced to the model

Wrapped MCP tools dispatched by the orchestrator: `bash`, `view`, `present`, `str_replace`, `create`, `insert`. The router relays tool-call progress to the client as `tinfoil.tool_call` events so the UI can render running/completed/failed states inline.

## Wire headers

| Header                              | Set by | Purpose                               |
| ----------------------------------- | ------ | ------------------------------------- |
| `Authorization: Bearer <Clerk JWT>` | webapp | gates the session at the orchestrator |
| `X-Session-Id`                      | webapp | binds the session → container mapping |
| `X-Exec-Pubkey`                     | webapp | snapshot DEK wrap target (state plan) |
| `X-Exec-Resume-Dek`                 | webapp | snapshot resume key (state plan)      |

The router forwards these verbatim to the orchestrator's MCP endpoint.
