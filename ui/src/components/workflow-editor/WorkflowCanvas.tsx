import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { WorkflowNodeWithPosition } from "./types";
import { WorkflowNode } from "./WorkflowNode";
import { ConnectionLayer } from "./ConnectionLayer";

interface WorkflowCanvasProps {
  nodes: WorkflowNodeWithPosition[];
  selectedNodeId: string | null;
  onNodePositionChange: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeSelect: (nodeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
}

// Direct node wrapper with drag
function NodeWrapper({
  node,
  isSelected,
  onSelect,
  onDelete,
}: {
  node: WorkflowNodeWithPosition;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: node.id,
    data: { node },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        position: "absolute",
        left: node.position.x,
        top: node.position.y,
        width: 240,
        height: 100,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      className={`${isDragging ? "opacity-30" : ""} transition-opacity`}
      {...attributes}
      {...listeners}
    >
      <WorkflowNode
        node={node}
        isSelected={isSelected}
        onSelect={onSelect}
        onDelete={onDelete}
        isReadOnly={false}
      />
    </div>
  );
}

export function WorkflowCanvas({
  nodes,
  selectedNodeId,
  onNodePositionChange,
  onNodeSelect,
  onNodeDelete,
}: WorkflowCanvasProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const activeNode = activeId ? nodes.find((n) => n.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active?.id as string ?? null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    const nodeId = active.id as string ?? null;

    setActiveId(null);

    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      const newPosition = {
        x: Math.max(0, node.position.x + delta.x),
        y: Math.max(0, node.position.y + delta.y),
      };
      onNodePositionChange(nodeId, newPosition);
    }
  }, [nodes, onNodePositionChange]);

  return (
    <DndContext
      id="workflow-canvas"
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Background grid */}
      <div className="absolute inset-0 bg-muted/30 pointer-events-none">
        <svg className="w-full h-full" style={{ opacity: 0.08 }}>
          <defs>
            <pattern
              id="grid"
              width="30"
              height="30"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 30 0 L 0 0 0 30"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Connection lines layer */}
      <ConnectionLayer nodes={nodes} selectedNodeId={selectedNodeId} />

      {/* Nodes - direct implementation */}
      <div className="absolute inset-0">
        {nodes.map((node) => (
          <NodeWrapper
            key={node.id}
            node={node}
            isSelected={selectedNodeId === node.id}
            onSelect={() => onNodeSelect(node.id)}
            onDelete={() => onNodeDelete(node.id)}
          />
        ))}

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-card p-6 rounded-lg border shadow-sm">
              <p className="text-sm font-medium mb-2">No nodes yet</p>
              <p className="text-xs text-muted-foreground">
                Click "Add Task" or "Add Gate" below to start
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeNode ? (
          <div
            style={{
              width: 240,
              height: 100,
              opacity: 0.9,
              cursor: "grabbing",
            }}
          >
            <WorkflowNode
              node={activeNode}
              isSelected={selectedNodeId === activeNode.id}
              onSelect={() => {}}
              onDelete={() => {}}
              isReadOnly={true}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
