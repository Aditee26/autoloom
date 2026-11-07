import { Background, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { nodeTypes } from '../nodes/FlowNode';

export default function TemplatePreview({ nodes, edges, height = 360 }) {
  const rfNodes = nodes.map((n) => ({ ...n, data: { ...n.data, nodeId: n.id }, draggable: false, selectable: false }));
  const rfEdges = edges.map((e) => ({ ...e, selectable: false, type: 'smoothstep' }));
  return (
    <div style={{ height }} className="overflow-hidden rounded-md border border-line">
      <ReactFlowProvider>
        <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} panOnDrag proOptions={{ hideAttribution: true }}>
          <Background gap={18} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
