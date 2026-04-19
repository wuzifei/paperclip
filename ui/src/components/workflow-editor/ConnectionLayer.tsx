import type { WorkflowNodeWithPosition } from "./types";
import { getConnections, bezierPath, NODE_WIDTH, NODE_HEIGHT } from "./types";

interface ConnectionLayerProps {
  nodes: WorkflowNodeWithPosition[];
  selectedNodeId: string | null;
}

export function ConnectionLayer({ nodes, selectedNodeId }: ConnectionLayerProps) {
  const connections = getConnections(nodes);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Debug log
  console.log('ConnectionLayer render:', { nodeCount: nodes.length, connectionCount: connections.length, connections });

  if (connections.length === 0) return null;

  return (
    <svg
      className="absolute inset-0"
      style={{
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 1
      }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="rgba(120, 120, 120, 0.5)"
          />
        </marker>
      </defs>
      {connections.map((conn) => {
        const fromNode = nodeMap.get(conn.from);
        const toNode = nodeMap.get(conn.to);
        if (!fromNode || !toNode) return null;

        const isConnectedToSelected =
          selectedNodeId === conn.from || selectedNodeId === conn.to;

        const strokeColor = isConnectedToSelected ? 'rgb(59, 130, 246)' : 'rgba(120, 120, 120, 0.5)';
        const strokeWidth = isConnectedToSelected ? 2 : 1.5;

        const startX = fromNode.position.x + NODE_WIDTH;
        const startY = fromNode.position.y + NODE_HEIGHT / 2;
        const endX = toNode.position.x;
        const endY = toNode.position.y + NODE_HEIGHT / 2;

        const controlOffset = Math.abs(endX - startX) * 0.5;
        const cp1X = startX + controlOffset;
        const cp2X = endX - controlOffset;

        const pathD = `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`;

        return (
          <g key={`${conn.from}-${conn.to}`}>
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              markerEnd="url(#arrowhead)"
              style={{
                fill: 'none'
              }}
            />
            {isConnectedToSelected && (
              <text
                x={(fromNode.position.x + NODE_WIDTH + toNode.position.x) / 2}
                y={(fromNode.position.y + toNode.position.y) / 2 - 10}
                textAnchor="middle"
                style={{
                  fill: 'rgb(59, 130, 246)',
                  fontSize: '11px',
                  fontWeight: '500'
                }}
              >
                blocks
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
