'use client'

import { getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'

// Create a custom edge type
type CustomEdge = Edge

function TurboEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  sourceHandleId,
  targetHandleId,
}: EdgeProps<CustomEdge>) {
  const xEqual = sourceX === targetX
  const yEqual = sourceY === targetY

  // Custom offset for specific connections
  let adjustedSourceX = sourceX
  let adjustedSourceY = sourceY
  let adjustedTargetX = targetX
  let adjustedTargetY = targetY

  // Special case for the enclave to attestation connection
  if (id === 'e-enclave-attestation') {
    // Move the source point more to the right for this specific connection
    adjustedSourceX = sourceX + 100 // Adjust this value as needed
  }

  // Special cases for GitHub and Sigstore connections
  if (id === 'e-client-github') {
    // Adjust the source point to be more centered
    adjustedSourceX = sourceX // Center relative to GitHub node
  }

  if (id === 'e-client-sigstore') {
    // Adjust the source point to be more centered
    adjustedSourceX = sourceX // Center relative to Sigstore node
  }

  // Add a small offset to prevent straight lines that can cause rendering issues
  const pathParams = {
    sourceX: xEqual ? adjustedSourceX + 0.0001 : adjustedSourceX,
    sourceY: yEqual ? adjustedSourceY + 0.0001 : adjustedSourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition,
    curvature: 0.3, // Moderate curvature for smooth bends
  }

  // Adjust source position based on the handle ID
  if (sourceHandleId === 'source-left') {
    pathParams.sourceX -= 5
  } else if (sourceHandleId === 'source-right') {
    pathParams.sourceX += 5
  } else if (sourceHandleId === 'source-top') {
    pathParams.sourceY -= 5
  } else if (sourceHandleId === 'source-bottom') {
    pathParams.sourceY += 5
  }

  // Adjust target position based on the handle ID
  if (targetHandleId === 'target-left') {
    pathParams.targetX -= 5
  } else if (targetHandleId === 'target-right') {
    pathParams.targetX += 5
  } else if (targetHandleId === 'target-top') {
    pathParams.targetY -= 5
  } else if (targetHandleId === 'target-bottom') {
    pathParams.targetY += 5
  }

  // Generate the path
  const [edgePath] = getBezierPath(pathParams)

  return (
    <path
      id={id}
      style={{ stroke: 'rgba(0, 0, 0, 0.6)', ...style }}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
    />
  )
}

TurboEdge.displayName = 'TurboEdge'

export default memo(TurboEdge)
