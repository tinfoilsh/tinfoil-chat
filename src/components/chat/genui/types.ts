export interface GenUIToolCall {
  id: string
  name: string
  arguments: string
}

export interface GenUIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface GenUIComponentDef {
  validate: (props: Record<string, unknown>) => boolean
  component: React.FC<any>
  toolDefinition: GenUIToolDefinition
}
