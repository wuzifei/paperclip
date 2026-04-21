import type { WorkflowNodeDef as OriginalWorkflowNodeDef } from "@/api/workflows";

// Override and export to include position implicitly 
export interface WorkflowNodeDef extends OriginalWorkflowNodeDef {
  position?: { x: number; y: number };
}

/**
 * Extended node type with position information for visual editor
 */
export interface WorkflowNodeWithPosition extends WorkflowNodeDef {
  position: { x: number; y: number };
}

/**
 * Editor state management
 */
export interface WorkflowEditorState {
  templateId: string | null;
  name: string;
  description: string;
  nodes: WorkflowNodeWithPosition[];
  selectedNodeId: string | null;
}

export interface NodePaletteItem {
  type: "task" | "approval_gate";
  label: string;
  icon: string;
  defaultTitle: string;
  defaultAssigneeAgentId: string;
}

export const NODE_PALETTE: NodePaletteItem[] = [
  {
    type: "task",
    label: "Task",
    icon: "⚙️",
    defaultTitle: "New Task",
    defaultAssigneeAgentId: "", // Will be selected by user
  },
  {
    type: "approval_gate",
    label: "Approval Gate",
    icon: "🛡️",
    defaultTitle: "Review Gate",
    defaultAssigneeAgentId: "me", // Fixed to 'me' for human approval
  },
];

/**
 * Stop stripping the position so that the backend can persist our UI metadata inside JSON.
 */
export function stripPosition(
  nodes: WorkflowNodeWithPosition[]
): WorkflowNodeDef[] {
  // We now KEEP the position so that the JSON structure persists UI states!
  return nodes;
}

/**
 * Convert WorkflowNodeDef to WorkflowNodeWithPosition with SMART grid layout default position
 * Uses a horizontal layout approach with simple collision avoidance.
 */
export function addPosition(
  nodes: WorkflowNodeDef[]
): WorkflowNodeWithPosition[] {
  return nodes.map((node, i) => {
    // If backend already has the persisted location, use it!
    if (node.position) {
      return { ...node, position: node.position };
    }

    // Otherwise elegantly auto-format missing nodes in a flowing pipeline style
    // 280px horizontal gap, wrap every 4 items to the next row (150px gap)
    const columns = 4;
    const row = Math.floor(i / columns);
    const col = i % columns;

    return {
      ...node,
      position: {
        x: 60 + col * 280,
        y: 60 + row * 130,
      },
    };
  });
}

/**
 * Generate a unique node ID
 */
export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get connection paths for rendering lines between nodes
 */
export interface Connection {
  from: string; // source node id
  to: string; // target node id
}

export function getConnections(
  nodes: WorkflowNodeWithPosition[]
): Connection[] {
  const connections: Connection[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    if (node.blockedBy) {
      for (const blockedById of node.blockedBy) {
        const blockedByNode = nodeMap.get(blockedById);
        if (blockedByNode) {
          connections.push({ from: blockedById, to: node.id });
        }
      }
    }
  }

  return connections;
}

/**
 * Calculate bezier curve path for connection
 */
export function bezierPath(
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number }
): string {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;

  const controlOffset = Math.abs(endX - startX) * 0.5;
  const cp1X = startX + controlOffset;
  const cp1Y = startY;
  const cp2X = endX - controlOffset;
  const cp2Y = endY;

  return `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
}

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 100;
export const NODE_PORT_RADIUS = 6;
