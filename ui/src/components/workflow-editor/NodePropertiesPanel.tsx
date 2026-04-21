import { useState, useEffect } from "react";
import type { WorkflowNodeWithPosition } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus } from "lucide-react";

interface NodePropertiesPanelProps {
  node: WorkflowNodeWithPosition | null;
  allNodes: WorkflowNodeWithPosition[];
  agents: Agent[];
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNodeWithPosition>) => void;
  onAdd: (type: "task" | "approval_gate") => void;
}

import type { Agent } from '@paperclipai/shared';
import { AGENT_ROLE_LABELS } from '@paperclipai/shared';

function getRoleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return AGENT_ROLE_LABELS[role as keyof typeof AGENT_ROLE_LABELS] ?? role.replace(/_/g, " ");
}

export function NodePropertiesPanel({
  node,
  allNodes,
  agents,
  isOpen,
  onClose,
  onUpdate,
  onAdd,
}: NodePropertiesPanelProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"task" | "approval_gate">("task");
  const [assigneeAgentId, setAssigneeAgentId] = useState("");
  const [description, setDescription] = useState("");
  const [blockedBy, setBlockedBy] = useState<string[]>([]);

  useEffect(() => {
    if (node) {
      setTitle(node.title);
      setType(node.type);
      setAssigneeAgentId(node.assigneeAgentId ?? "");
      setDescription(node.description ?? "");
      setBlockedBy(node.blockedBy ?? []);
    }
  }, [node]);

  function handleSave(overrides?: Partial<WorkflowNodeWithPosition>) {
    if (!node) return;
    const isGate = overrides?.type === "approval_gate" || (!overrides?.type && type === "approval_gate");
    const saveAssigneeId = isGate ? "me" : assigneeAgentId;
    const saveAssigneeRole = overrides?.assigneeRole ?? node.assigneeRole ?? "";

    onUpdate(node.id, {
      assigneeAgentId: saveAssigneeId,
      assigneeRole: saveAssigneeRole,
      title,
      type,
      description,
      blockedBy,
      ...overrides,
    });
  }

  function toggleBlockedBy(targetNodeId: string) {
    const newBlockedBy = blockedBy.includes(targetNodeId)
      ? blockedBy.filter((id) => id !== targetNodeId)
      : [...blockedBy, targetNodeId];
      
    setBlockedBy(newBlockedBy);
    // Explicitly pass the new state to handleSave because React state is async
    handleSave({ blockedBy: newBlockedBy });
  }

  if (!node) return null;

  const availableNodes = allNodes.filter((n) => n.id !== node.id);

  return (
    <>
      {isOpen && (
        <div className="absolute right-0 top-0 bottom-0 w-[400px] bg-card border-l shadow-2xl z-40 flex flex-col animate-in slide-in-from-right transition-all duration-300">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold">Edit Node</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Node ID</Label>
              <Input
                value={node.id}
                readOnly
                className="bg-muted text-muted-foreground font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="node-title">Title</Label>
              <Input
                id="node-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Node title..."
                onBlur={() => handleSave()}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="node-type">Type</Label>
              <Select
                value={type}
                onValueChange={(value: "task" | "approval_gate") => {
                  setType(value);
                  const newAssigneeId = value === "approval_gate" ? "me" : assigneeAgentId;
                  if (value === "approval_gate") setAssigneeAgentId("me");
                  handleSave({ type: value, assigneeAgentId: newAssigneeId });
                }}
              >
                <SelectTrigger id="node-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">
                    <div className="flex items-center gap-2">
                      <span>⚙️</span>
                      <span>Task</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="approval_gate">
                    <div className="flex items-center gap-2">
                      <span>🛡️</span>
                      <span>Approval Gate</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="node-assignee">Assignee</Label>
              <Select
                value={type === "approval_gate" ? "me" : assigneeAgentId}
                onValueChange={(value) => {
                  setAssigneeAgentId(value);
                  // 选择 Agent 时，同时设置 assigneeAgentId 和 assigneeRole
                  // assigneeRole 存储的是 agent.name（显示名称），不是 role
                  if (value === "me") {
                    // 手动审批的情况
                    handleSave({ assigneeAgentId: "me", assigneeRole: "human" });
                  } else {
                    // 从 agents 列表中找到所选 Agent，获取其 name 作为 assigneeRole
                    const selectedAgent = agents.find((a) => a.id === value);
                    handleSave({
                      assigneeAgentId: value,
                      assigneeRole: selectedAgent?.name ?? "",
                    });
                  }
                }}
                disabled={type === "approval_gate"}
              >
                <SelectTrigger id="node-assignee">
                  <SelectValue placeholder="Select an assignee..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">
                    <span className="font-medium">Me (Manual Approval)</span>
                  </SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center justify-between w-full pr-4 gap-4">
                        <span>{a.name}</span>
                        <span className="text-[10px] text-muted-foreground opacity-70">{getRoleLabel(a.role)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {type === "approval_gate" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Approval gates are automatically assigned to the human initiator.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="node-description">Description</Label>
              <Textarea
                id="node-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
                onBlur={() => handleSave()}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1">
                <Label>Dependencies (Blocked By)</Label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2"
                  onClick={() => onAdd("task")}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New Node
                </Button>
              </div>
              <div className="border rounded-md divide-y max-h-[180px] overflow-y-auto bg-muted/10">
                {availableNodes.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground text-center">
                    No other nodes available
                  </div>
                ) : (
                  availableNodes.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`block-${n.id}`}
                        checked={blockedBy.includes(n.id)}
                        onCheckedChange={() => toggleBlockedBy(n.id)}
                      />
                      <label
                        htmlFor={`block-${n.id}`}
                        className="flex-1 text-sm cursor-pointer truncate"
                        title={n.title}
                      >
                        {n.title}
                      </label>
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        {n.type === "approval_gate" ? "🛡️ Gate" : "⚙️ Task"}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {blockedBy.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  This node waits for {blockedBy.length} task(s) to finish first.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
