/**
 * Tool call payload as seen by the UI.
 *
 * `arguments` is the raw JSON string accumulated from streaming
 * `tool-input-delta` chunks. Once the AI SDK emits the final `tool-call`
 * event, `input` is populated with the pre-parsed object so the renderer
 * doesn't have to re-parse on every frame.
 */
export interface GenUIToolCall {
  id: string
  name: string
  arguments: string
  input?: unknown
}

export interface GenUIComponentDef {
  validate: (props: Record<string, unknown>) => boolean
  component: React.FC<any>
}
