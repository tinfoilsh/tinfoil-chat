# Code Execution — Router Contract for Webapp Consumers

This document describes the contract the `confidential-model-router` (branch `dmccanns/add-code-exec`) exposes to its consumers (tinfoil-webapp, tinfoil-ios, etc.) for the new **code execution** tool family. It mirrors and extends the existing web search contract.

---

## 1. Activation

### Chat Completions (`/v1/chat/completions`)

Add `code_execution_options` to the request body (parallel to `web_search_options`):

```json
{
  "model": "...",
  "messages": [...],
  "code_execution_options": {}
}
```

The router detects this key and dials the `code-execution` MCP server.

### Responses API (`/v1/responses`)

Add a `{"type": "code_execution"}` entry to the `tools` array:

```json
{
  "model": "...",
  "input": "...",
  "tools": [{ "type": "code_execution" }]
}
```

### Both can coexist

Web search and code execution can be activated simultaneously:

```json
{
  "web_search_options": {},
  "code_execution_options": {}
}
```

or in Responses:

```json
{
  "tools": [{ "type": "web_search" }, { "type": "code_execution" }]
}
```

---

## 2. Opt-In to Streaming Progress Events

### Header: `X-Tinfoil-Events`

Comma-separated list of event families the client wants to receive:

| Value            | Effect                                               |
| ---------------- | ---------------------------------------------------- |
| `web_search`     | Enables `tinfoil.web_search_call` markers (existing) |
| `code_execution` | Enables `tinfoil.tool_call` markers (**new**)        |

Example: `X-Tinfoil-Events: web_search,code_execution`

Case-insensitive. Unknown families are silently ignored.

**If the client does NOT send `code_execution` in this header, no code-execution markers are emitted** — the tool still runs server-side, but progress is invisible to the client.

---

## 3. Event Shapes — Chat Completions (Streaming)

Code execution events are delivered as `<tinfoil-event>` XML markers embedded in `delta.content` of `chat.completion.chunk` SSE frames, identical to how web search markers work.

### Marker format

```
\n<tinfoil-event>{JSON payload}</tinfoil-event>\n
```

### Payload type: `tinfoil.tool_call`

#### `in_progress` (tool call started)

```json
{
  "type": "tinfoil.tool_call",
  "item_id": "tc_<uuid>",
  "status": "in_progress",
  "tool": {
    "name": "bash",
    "arguments": { "command": "python3 script.py" }
  }
}
```

#### `completed` (tool call finished successfully)

```json
{
  "type": "tinfoil.tool_call",
  "item_id": "tc_<uuid>",
  "status": "completed",
  "tool": {
    "name": "bash",
    "output": "Hello world\nexit_code: 0"
  }
}
```

#### `failed` (tool call errored)

```json
{
  "type": "tinfoil.tool_call",
  "item_id": "tc_<uuid>",
  "status": "failed",
  "tool": {
    "name": "bash",
    "output": "error: command not found"
  }
}
```

### Key differences from web search markers

| Field                 | Web Search (`tinfoil.web_search_call`) | Code Exec (`tinfoil.tool_call`)  |
| --------------------- | -------------------------------------- | -------------------------------- |
| `type`                | `tinfoil.web_search_call`              | `tinfoil.tool_call`              |
| `item_id` prefix      | `ws_`                                  | `tc_`                            |
| Progress payload      | `action: {type, query/url}`            | `tool: {name, arguments/output}` |
| `in_progress` carries | `action` (search query or URL)         | `tool.arguments`                 |
| Terminal carries      | `action` + `sources[]`                 | `tool.output` (text result)      |

### Marker pairs

Each tool call produces exactly **two markers** with the same `item_id`:

1. `in_progress` — carries tool name + arguments
2. Terminal (`completed` / `failed`) — carries tool name + output

### Output truncation

The `tool.output` field in markers is capped at **4096 characters**. If exceeded, it's truncated with `…[truncated]` suffix. The full output still goes to the model.

### Non-streaming (Chat Completions)

In the non-streaming path, markers are prepended to `choices[].message.content` as a text prefix:

```
[web search markers]\n[code exec markers]\n[original assistant text]
```

Annotation indices are shifted to account for the prepended marker text.

---

## 4. Event Shapes — Responses API (Streaming)

Code execution uses OpenAI's `code_interpreter_call` output item type.

### SSE events emitted (in order)

1. **`response.output_item.added`** — item appears with `status: "in_progress"`

```json
{
  "type": "response.output_item.added",
  "output_index": 0,
  "item": {
    "id": "ci_<uuid>",
    "type": "code_interpreter_call",
    "status": "in_progress",
    "code": "bash: {\"command\":\"ls\"}"
  }
}
```

2. **Phase events** (intermediate progress):
   - `response.code_interpreter_call.in_progress`
   - `response.code_interpreter_call.interpreting`

```json
{
  "type": "response.code_interpreter_call.interpreting",
  "item_id": "ci_<uuid>",
  "output_index": 0
}
```

3. **`response.code_interpreter_call.completed`** (success phase)

4. **`response.output_item.done`** — terminal item with results

```json
{
  "type": "response.output_item.done",
  "output_index": 0,
  "item": {
    "id": "ci_<uuid>",
    "type": "code_interpreter_call",
    "status": "completed",
    "code": "bash: {\"command\":\"ls\"}",
    "results": [{ "type": "text", "text": "file.txt\ndir/" }]
  }
}
```

### Non-streaming (Responses)

In the non-streaming path, `code_interpreter_call` items are prepended to the `output[]` array:

```json
{
  "output": [
    { "type": "web_search_call", ... },
    { "type": "code_interpreter_call", "id": "ci_<uuid>", "status": "completed", "code": "bash: {\"command\":\"ls\"}", "results": [{"type":"text","text":"file.txt"}] },
    { "type": "message", ... }
  ]
}
```

Order: `[web_search_call items] → [code_interpreter_call items] → [message items]`

---

## 5. `code_interpreter_call` Item Shape

```typescript
interface CodeInterpreterCallItem {
  type: 'code_interpreter_call'
  id: string // "ci_<uuid>"
  status: 'in_progress' | 'completed' | 'failed'
  code: string // "<tool_name>: <JSON arguments>" or just "<tool_name>"
  results?: Array<{
    type: 'text'
    text: string // the tool's text output
  }>
  _tinfoil?: {
    // vendor extension, only on error
    status?: 'blocked' // when safety filter blocked
    error?: {
      code: string // e.g. "blocked_by_safety_filter"
    }
  }
}
```

### Status mapping

| Router internal | Surfaced as `status` | `_tinfoil.status` |
| --------------- | -------------------- | ----------------- |
| `completed`     | `"completed"`        | (absent)          |
| `failed`        | `"failed"`           | (absent)          |
| `blocked`       | `"failed"`           | `"blocked"`       |

The `blocked` → `failed` collapse mirrors web_search_call behavior: OpenAI's enum has no `blocked` slot, so the real status rides on `_tinfoil`.

---

## 6. MCP Tool Definitions

The code-execution MCP server (`confidential-code-execution` v0.1.0) advertises **5 tools**. The router passes their names through unchanged (unlike web search, which renames `search` → `router_search`).

### `bash`

Execute a bash command in a sandboxed container.

```typescript
{
  name: "bash",
  arguments: {
    command: string     // required — the bash command to execute
  }
}
// Output: "stdout:\n...\nstderr:\n...\nexit_code: 0"
// Error:  "error: ..."
```

### `view`

View a file's contents with line numbers.

```typescript
{
  name: "view",
  arguments: {
    path: string              // required — absolute or workspace-relative path
    view_range?: [number, number]  // optional — [start_line, end_line] (1-indexed, inclusive)
  }
}
// Output: "     1\tline content\n     2\tline content\n..."
```

### `str_replace`

Replace an exact string occurrence in a file (must be unique).

```typescript
{
  name: "str_replace",
  arguments: {
    path: string      // required
    old_str: string   // required — must appear exactly once
    new_str: string   // required
  }
}
// Output: "Replaced in <path>:\n<context snippet>"
// Error:  "error: old_str not found in <path>"
// Error:  "error: old_str appears N times in <path> (must be unique)"
```

### `create`

Create a new file (fails if it already exists).

```typescript
{
  name: "create",
  arguments: {
    path: string        // required
    file_text: string   // required — full file contents
  }
}
// Output: "Created <path> (N bytes)"
// Error:  "error: file already exists: <path>"
```

### `insert`

Insert text after a specific line number.

```typescript
{
  name: "insert",
  arguments: {
    path: string         // required
    line_number: number  // required — 0 = beginning, 1 = after first line
    text: string         // required
  }
}
// Output: "Inserted at line N in <path>:\n<context snippet>"
```

### Classification logic

The router classifies tools by name. Web search tools (`search`, `fetch`, `router_search`, `router_fetch`) are the only hardcoded names. **Everything else is treated as code execution**:

```
isWebSearchTool(name) = name in {search, fetch, router_search, router_fetch}
isCodeExecTool(name)  = !isWebSearchTool(name)
```

The webapp does NOT need to hardcode `bash`/`view`/`str_replace`/`create`/`insert` — it should handle any tool name generically. But knowing the actual tools helps design the UI (e.g., showing a terminal-style view for `bash`, a file viewer for `view`, a diff for `str_replace`).

---

## 7. Request Fields the Router Strips

The router removes these fields from the request body before forwarding upstream:

- `code_execution_options` (Chat Completions)
- `web_search_options` (Chat Completions)
- `filters`
- `pii_check_options`
- `prompt_injection_check_options`

On the Responses path, `{"type": "code_execution"}` and `{"type": "web_search"}` tool entries are replaced with the concrete MCP function tools.

---

## 8. Session Lifecycle

### `X-Session-Id` header

The router forwards `X-Session-Id` from the client request through to the code-execution MCP server. This header is **required** by the MCP server — calls without it return an error.

### How sessions work server-side

The code-execution server runs a **container pool orchestrator**:

1. A warm pool of sandboxed containers is kept ready (default: 3 warm, max: 10 total)
2. On the first tool call for a given `X-Session-Id`, a container is assigned from the warm pool (blocks up to 60s if pool is empty)
3. Subsequent tool calls with the same session ID reuse the same container — **filesystem state persists across calls**
4. When the session ends, the container is deleted

### Implications for the webapp

- The webapp already sends `X-Session-Id` (used for dev logging). This same header now provides container affinity for code execution
- Files created by `bash` or `create` in one turn are visible to `view` or `str_replace` in the next turn (within the same session)
- Different chats should use different session IDs to get isolated containers
- Container startup may add latency to the first code-exec call in a session (~seconds while a warm container is assigned)

---

## 9. Summary: What the Webapp Needs to Implement

### Request side:

1. Send `code_execution_options: {}` on Chat Completions requests
2. Add `X-Tinfoil-Events: web_search,code_execution` header (extend existing `web_search` value)
3. Ensure `X-Session-Id` is sent (already done for dev logging — same header provides container affinity)

### Streaming parsing (Chat Completions — the path the webapp uses):

1. Parse `<tinfoil-event>` markers from `delta.content` (existing infrastructure)
2. Handle new type `tinfoil.tool_call` alongside existing `tinfoil.web_search_call`
3. Match `in_progress` → terminal pairs by `item_id` (prefix `tc_`)
4. On `in_progress`: display tool name + arguments (e.g., "Running bash: `ls -la`")
5. On `completed`/`failed`: display tool output (possibly truncated at 4096 chars)

### UI rendering (per tool name):

| Tool          | Suggested UI                                                     |
| ------------- | ---------------------------------------------------------------- |
| `bash`        | Terminal-style block: show command, then stdout/stderr/exit_code |
| `view`        | File viewer with line numbers (content is pre-numbered)          |
| `str_replace` | Diff-style view: old → new with file path                        |
| `create`      | File creation confirmation with path                             |
| `insert`      | Insertion confirmation with context snippet                      |
| (unknown)     | Generic: show tool name + arguments → output                     |

### Error handling:

- `status: "failed"` → generic error
- `_tinfoil.status: "blocked"` → safety filter blocked the call (show distinct UI)
