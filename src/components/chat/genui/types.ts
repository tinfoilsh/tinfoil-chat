export interface GenUIBlock {
  type: string
  props: Record<string, unknown>
}

export interface GenUIComponentDef {
  validate: (props: Record<string, unknown>) => boolean
  component: React.FC<any>
}
