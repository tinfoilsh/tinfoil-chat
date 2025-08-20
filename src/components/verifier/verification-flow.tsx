'use client'

import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import { useEffect } from 'react'
import { FaUser } from 'react-icons/fa'
import { FiGithub, FiKey, FiShield } from 'react-icons/fi'
import { LuBrain, LuCpu } from 'react-icons/lu'
import ContainerNode, { type ContainerNodeType } from './container-node'
import TurboEdge from './turbo-edge'
import TurboNode, { type TurboNodeData } from './turbo-node'

import '@xyflow/react/dist/style.css'
import './flow.css'

type VerificationFlowProps = {
  isDarkMode: boolean
  verificationStatus?: 'idle' | 'verifying' | 'success' | 'error'
}

// Define the custom node types
type CustomNode = Node<TurboNodeData>

function VerificationFlowDiagram({
  isDarkMode,
  verificationStatus = 'idle',
}: VerificationFlowProps) {
  const initialNodes: (CustomNode | ContainerNodeType)[] = [
    {
      id: 'secure-hardware',
      position: { x: 74, y: -360 },
      data: {
        title: 'Secure Hardware Enclave',
        icon: <LuCpu className="h-5 w-5" />,
        containerId: 'secure-hardware-container',
      },
      type: 'container',
      style: {
        width: 280,
        height: 160,
        zIndex: 0,
      },
    },
    {
      id: 'client',
      position: { x: 130, y: 155 },
      data: {
        title: 'Tinfoil Verifier',
        icon: <ShieldCheckIcon className="h-5 w-5" />,
      },
      type: 'turbo',
      style: {
        width: 280,
      },
    },
    {
      id: 'ai-model',
      position: { x: 65, y: 65 },
      data: {
        title: 'AI Model',
        icon: <LuBrain />,
      },
      type: 'turbo',
      parentId: 'secure-hardware',
      extent: 'parent',
      style: {
        zIndex: 1,
      },
    },
    {
      id: 'attestation',
      position: { x: 95, y: -150 },
      data: {
        title: 'Enclave Attestation',
        subtitle: 'Enclave Runtime Verification',
        icon: <FiShield />,
      },
      type: 'turbo',
    },
    {
      id: 'transparency',
      position: { x: -40, y: 0 },
      data: {
        title: 'Transparency Log',
        subtitle: 'Artifact Verification',
        icon: <FiKey />,
      },
      type: 'turbo',
    },
    {
      id: 'github',
      position: { x: 300, y: 0 },
      data: {
        title: 'GitHub',
        subtitle: 'Source Code',
        icon: <FiGithub />,
      },
      type: 'turbo',
    },
    {
      id: 'user',
      position: { x: 140, y: 280 },
      data: {
        title: 'This Chat',
        icon: <FaUser />,
      },
      type: 'turbo',
      style: {
        width: 280,
      },
    },
  ]

  const initialEdges: Edge[] = [
    {
      id: 'secure-hardware-attestation',
      source: 'secure-hardware',
      target: 'attestation',
      type: 'turbo',
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
      animated: true,
      style: {
        stroke: isDarkMode
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(107, 114, 128, 0.5)',
        strokeDasharray: '5 5',
        strokeWidth: 1.5,
      },
    },
    {
      id: 'attestation-client',
      source: 'attestation',
      target: 'client',
      type: 'turbo',
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
      animated: true,
      style: {
        stroke: isDarkMode
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(107, 114, 128, 0.5)',
        strokeDasharray: '5 5',
        strokeWidth: 1.5,
      },
    },
    {
      id: 'transparency-client',
      source: 'transparency',
      target: 'client',
      type: 'turbo',
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
      animated: true,
      style: {
        stroke: isDarkMode
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(107, 114, 128, 0.5)',
        strokeDasharray: '5 5',
        strokeWidth: 1.5,
      },
    },
    {
      id: 'github-client',
      source: 'github',
      target: 'client',
      type: 'turbo',
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
      animated: true,
      style: {
        stroke: isDarkMode
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(107, 114, 128, 0.5)',
        strokeDasharray: '5 5',
        strokeWidth: 1.5,
      },
    },
    {
      id: 'client-user',
      source: 'client',
      target: 'user',
      type: 'turbo',
      sourceHandle: 'source-bottom',
      targetHandle: 'target-top',
      animated: true,
      style: {
        stroke: isDarkMode
          ? 'rgba(255, 255, 255, 0.4)'
          : 'rgba(107, 114, 128, 0.5)',
        strokeDasharray: '5 5',
        strokeWidth: 1.5,
      },
    },
  ]

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const reactFlowInstance = useReactFlow()

  // Update edge styles when theme or verification status changes
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        animated: verificationStatus === 'verifying',
        style: {
          stroke:
            verificationStatus === 'success'
              ? 'rgba(16, 185, 129, 0.6)'
              : verificationStatus === 'error'
                ? 'rgba(239, 68, 68, 0.6)'
                : isDarkMode
                  ? 'rgba(255, 255, 255, 0.4)'
                  : 'rgba(107, 114, 128, 0.5)',
          strokeDasharray: verificationStatus === 'verifying' ? '5 5' : '5 5',
          strokeWidth: verificationStatus === 'verifying' ? 2 : 1.5,
        },
      })),
    )
  }, [isDarkMode, verificationStatus, setEdges])

  // Update node styles when verification status changes
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'client') {
          return {
            ...node,
            data: {
              ...node.data,
              verificationStatus,
            },
          }
        }
        return node
      }),
    )
  }, [verificationStatus, setNodes])

  const nodeTypes = {
    turbo: TurboNode,
    container: ContainerNode,
  }

  const edgeTypes = {
    turbo: TurboEdge,
  }

  const defaultEdgeOptions = {
    type: 'turbo',
    markerEnd: 'circle-marker',
    markerStart: 'circle-marker',
    animated: true,
  }

  return (
    <>
      <style>{`
        .verification-flow-container .react-flow__node-turbo {
          background-color: transparent !important;
        }
        .verification-flow-container .react-flow__node {
          background-color: transparent !important;
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
        }
      `}</style>
      <div
        className={`verification-flow-container h-[400px] w-full ${isDarkMode ? 'dark' : ''}`}
        style={{ fontSize: '120%' }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          fitView
          fitViewOptions={{ padding: 0, maxZoom: 1 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          panOnDrag={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={26}
            size={1.3}
            color={isDarkMode ? '#374151' : '#e5e7eb'}
          />

          {/* SVG definitions for markers */}
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              <marker
                id="circle-marker"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="10"
                markerHeight="10"
                orient="auto"
              >
                <circle cx="5" cy="5" r="3" fill="rgba(80, 100, 120, 0.6)" />
              </marker>
            </defs>
          </svg>
        </ReactFlow>
      </div>
    </>
  )
}

function VerificationFlowWrapper(props: VerificationFlowProps) {
  return (
    <ReactFlowProvider>
      <VerificationFlowDiagram {...props} />
    </ReactFlowProvider>
  )
}

export function VerificationFlow({
  isDarkMode,
  verificationStatus,
}: VerificationFlowProps) {
  return (
    <div className="px-4 py-0">
      <div className="overflow-hidden rounded-lg bg-transparent">
        <VerificationFlowWrapper
          isDarkMode={isDarkMode}
          verificationStatus={verificationStatus}
        />
      </div>
    </div>
  )
}
