import type { Node } from '@xyflow/react'
import type { ResumeNode } from '../domain/model'

/** React Flow's view of a domain graph node (adds the canvas-only fields NodeProps expects). */
export type FlowNode<T extends ResumeNode> = Node<T['data'], T['type']>
