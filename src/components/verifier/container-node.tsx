'use client'

import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { memo } from 'react'

type ContainerNodeData = {
  title: string
  icon?: React.ReactNode
  containerId?: string
}

type ContainerNodeType = Node<ContainerNodeData>

function ContainerNode({ data }: NodeProps<ContainerNodeType>) {
  return (
    <div
      className="container-node"
      id={data.containerId}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      <div className="container-header">
        {data.icon && <div className="icon">{data.icon}</div>}
        <div className="title">{data.title}</div>
      </div>

      {/* Handles for connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="connection-handle"
        style={{ left: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className="connection-handle"
        style={{ left: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="connection-handle"
        style={{ left: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="connection-handle"
        style={{ left: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="connection-handle"
        style={{ top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className="connection-handle"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="connection-handle"
        style={{ top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="connection-handle"
        style={{ top: '50%' }}
      />
    </div>
  )
}

ContainerNode.displayName = 'ContainerNode'

export type { ContainerNodeData, ContainerNodeType }
export default memo(ContainerNode)
