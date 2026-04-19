import type { WorkflowNodeWithPosition } from "./types";
import { Badge } from "@/components/ui/badge";
import { Cog, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowNodeProps {
  node: WorkflowNodeWithPosition;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isReadOnly?: boolean;
}

export function WorkflowNode({ node, isSelected, onSelect, onDelete, isReadOnly = false }: WorkflowNodeProps) {
  const isTask = node.type === "task";
  const isApprovalGate = node.type === "approval_gate";

  return (
    <div
      className={cn(
        "absolute inset-0 rounded-lg border-2 bg-card shadow-sm transition-all select-none flex flex-col",
        isSelected ? "border-primary ring-2 ring-primary/20 shadow-md" : "border-border hover:border-primary/50",
        isApprovalGate && "border-amber-200 dark:border-amber-900/50"
      )}
      onClick={(e) => {
        // Only trigger select if click originated from within the node
        onSelect();
      }}
    >
      {/* Delete button - hidden in read-only mode */}
      {!isReadOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onPointerDown={(e) => {
            // Very important! Prevent the drag from firing when trying to click delete.
            e.stopPropagation();
          }}
          className="absolute top-2 right-2 p-1.5 pt-1.5 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors z-20 rounded-md"
          title="Delete Node"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      {/* Node content */}
      <div className="px-4 py-3 h-full flex flex-col pointer-events-none">
        {/* Type badge */}
        <div className="mb-2">
          <Badge
            variant="secondary"
            className={cn(
              "text-xs",
              isApprovalGate
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
            )}
          >
            {isApprovalGate ? (
              <>
                <ShieldCheck className="h-3 w-3 mr-1" />
                Approval Gate
              </>
            ) : (
              <>
                <Cog className="h-3 w-3 mr-1" />
                Task
              </>
            )}
          </Badge>
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium line-clamp-2 mb-1">{node.title}</h4>

        {/* Assignee */}
        <p className="text-xs text-muted-foreground mb-1">
          Role: <span className="font-mono">{node.assigneeRole}</span>
        </p>
      </div>

      {/* Input port (left) - for incoming connections */}
      <div
        className="absolute left-0 top-1/2 -translate-x-[6px] -translate-y-1/2 w-3 h-3 rounded-full bg-border border-2 border-background z-10"
        title="Input port"
      />

      {/* Output port (right) - for outgoing connections */}
      <div
        className="absolute right-0 top-1/2 translate-x-[6px] -translate-y-1/2 w-3 h-3 rounded-full bg-border border-2 border-background z-10"
        title="Output port"
      />
    </div>
  );
}
