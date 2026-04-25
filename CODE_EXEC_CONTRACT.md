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

## 6. Tool Names

The router's MCP server exposes concrete tool names (not `code_execution`). Known tool names observed:

- `bash` — shell command execution
- `view` — file viewer

The `tool.name` field in markers and `code` field in output items carry these concrete names. The webapp should handle **any** tool name that isn't `search` or `fetch` (which belong to web search) as a code-execution tool.

### Classification logic

```
isWebSearchTool(name) = isRouterSearchToolName(name) || isRouterFetchToolName(name)

// Everything else is code execution
isCodeExecTool(name) = !isWebSearchTool(name)
```

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

## 8. Session ID Forwarding

The router forwards `X-Session-Id` from the client request to the MCP tool server. This enables session-scoped state on the code-execution server (e.g., persistent filesystem between tool calls within a conversation).

---

## 9. Summary: What the Webapp Needs to Implement

### To activate code execution:

1. Send `code_execution_options: {}` on Chat Completions requests (or `{"type": "code_execution"}` in Responses tools)
2. Send `X-Tinfoil-Events: web_search,code_execution` header

### To render code execution progress (Chat Completions streaming):

1. Parse `<tinfoil-event>` markers from `delta.content` (existing infrastructure)
2. Handle new type `tinfoil.tool_call` alongside existing `tinfoil.web_search_call`
3. Match `in_progress` → terminal pairs by `item_id` (prefix `tc_`)
4. Display tool name + arguments during `in_progress`, tool output on completion
5. Handle output truncation (look for `…[truncated]` suffix)

### To render code execution progress (Responses streaming):

1. Handle `response.output_item.added` with `type: "code_interpreter_call"`
2. Handle phase events: `response.code_interpreter_call.in_progress`, `.interpreting`, `.completed`
3. Handle `response.output_item.done` with `type: "code_interpreter_call"`

### Error handling:

- `status: "failed"` → generic error
- `_tinfoil.status: "blocked"` → safety filter blocked the call (show distinct UI)
