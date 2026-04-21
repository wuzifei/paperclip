import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowsApi, type WorkflowTemplate, type WorkflowNodeDef } from "@/api/workflows";
import { agentsApi } from "@/api/agents";
import {
  WorkflowEditorState,
  stripPosition,
  addPosition,
  generateNodeId,
} from "./types";
import { WorkflowCanvas } from "./WorkflowCanvas";
import { NodePropertiesPanel } from "./NodePropertiesPanel";
import { Save, X, Plus, Loader2, Maximize2, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface WorkflowEditorProps {
  companyId: string;
  template: WorkflowTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMPTY_STATE: WorkflowEditorState = {
  templateId: null,
  name: "",
  description: "",
  nodes: [],
  selectedNodeId: null,
};

export function WorkflowEditor({
  companyId,
  template,
  isOpen,
  onClose,
  onSuccess,
}: WorkflowEditorProps) {
  const queryClient = useQueryClient();
  const [editorState, setEditorState] = useState<WorkflowEditorState>(EMPTY_STATE);
  const [hasChanges, setHasChanges] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [showRawJson, setShowRawJson] = useState(false);
  const { data: agents = [] } = useQuery({
    queryKey: ["agents", companyId],
    queryFn: () => agentsApi.list(companyId),
    enabled: isOpen,
  });

  // Load template data when opening or template changes
  useEffect(() => {
    if (isOpen && template) {
      setEditorState({
        templateId: template.id,
        name: template.name,
        description: template.description ?? "",
        nodes: addPosition(template.nodes),
        selectedNodeId: null,
      });
      setHasChanges(false);
      setIsFullscreen(true);
      setShowRawJson(false);
    } else if (isOpen && !template) {
      // New template mode - start with empty state
      setEditorState({
        templateId: null,
        name: "",
        description: "",
        nodes: [],
        selectedNodeId: null,
      });
      setHasChanges(false);
      setIsFullscreen(true);
      setShowRawJson(false);
    }
  }, [isOpen, template]);

  // Handle saving (create or update)
  const saveMutation = useMutation({
    mutationFn: () => {
      const nodes = stripPosition(editorState.nodes);
      if (editorState.templateId) {
        // Update existing template
        return workflowsApi.updateTemplate(companyId, editorState.templateId, {
          name: editorState.name,
          description: editorState.description,
          nodes,
        });
      } else {
        // Create new template
        return workflowsApi.createTemplate(companyId, {
          name: editorState.name,
          description: editorState.description || undefined,
          nodes,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", "templates", companyId] });
      setHasChanges(false);
      onSuccess();
    },
  });

  // Update editor state
  function updateState(updates: Partial<WorkflowEditorState>) {
    setEditorState((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  }

  // Add a new node
  function addNode(type: "task" | "approval_gate") {
    // 新建节点时，assigneeRole 和 assigneeAgentId 都应为空
    // 用户在 NodePropertiesPanel 中选择 Agent 后才会赋值
    const isGate = type === "approval_gate";
    const newNode = {
      id: generateNodeId(),
      type,
      title: type === "task" ? "New Task" : "Review Gate",
      assigneeAgentId: isGate ? "me" : "",
      assigneeRole: isGate ? "human" : "", // 选择 Agent 后会从 Agent.role 获取
      description: "",
      blockedBy: [] as string[],
      position: {
        x: 100 + editorState.nodes.length * 50,
        y: 100 + editorState.nodes.length * 30
      },
    };
    updateState({
      nodes: [...editorState.nodes, newNode],
      selectedNodeId: newNode.id,
    });
  }

  // Delete a node
  function deleteNode(nodeId: string) {
    const newNodes = editorState.nodes.filter((n) => n.id !== nodeId);
    // Remove references to this node in blockedBy
    const cleanedNodes = newNodes.map((n) => ({
      ...n,
      blockedBy: n.blockedBy?.filter((id) => id !== nodeId) ?? [],
    }));
    updateState({
      nodes: cleanedNodes,
      selectedNodeId: null,
    });
  }

  // Handle unsaved changes
  function handleClose() {
    if (hasChanges && !confirm("You have unsaved changes. Close anyway?")) {
      return;
    }
    onClose();
  }

  if (!isOpen) return null;

  const dialogClass = isFullscreen
    ? "fixed inset-0 w-screen h-screen max-w-none m-0 rounded-none border-none"
    : "max-w-[95vw] max-h-[85vh]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`${dialogClass} bg-card border rounded-lg shadow-xl flex flex-col transition-all duration-200`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
          <div className="flex-1 space-y-2">
            <h2 className="text-lg font-semibold">
              {template ? "Edit Template" : "Create New Template"}
            </h2>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Template Name</Label>
              <Input
                value={editorState.name}
                onChange={(e) => updateState({ name: e.target.value })}
                placeholder="Template name..."
                className="h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-xs text-muted-foreground">Unsaved</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRawJson(!showRawJson)}
              title={showRawJson ? "Show Designer" : "View Raw JSON"}
            >
              <Code className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Description */}
        <div className="px-6 py-2 border-b bg-muted/10">
          <Label className="text-xs text-muted-foreground mb-1 block">Description (optional)</Label>
          <Textarea
            value={editorState.description}
            onChange={(e) => updateState({ description: e.target.value })}
            placeholder="Template description..."
            className="h-16 text-sm resize-none"
            rows={2}
          />
        </div>

        {/* Main content - Canvas */}
        <div className={`flex-1 relative overflow-hidden ${isFullscreen ? 'h-[calc(100vh-180px)]' : 'h-[500px]'}`}>
          {showRawJson ? (
            <div className="absolute inset-0 bg-muted/50 p-6 overflow-auto">
              <pre className="text-xs font-mono bg-card text-foreground p-4 rounded border shadow-sm whitespace-pre-wrap word-break">
                {JSON.stringify(stripPosition(editorState.nodes), null, 2)}
              </pre>
            </div>
          ) : (
            <WorkflowCanvas
              nodes={editorState.nodes}
              selectedNodeId={editorState.selectedNodeId}
              onNodePositionChange={(nodeId, position) => {
                updateState({
                  nodes: editorState.nodes.map((n) =>
                    n.id === nodeId ? { ...n, position } : n
                  ),
                });
              }}
              onNodeSelect={(nodeId) => updateState({ selectedNodeId: nodeId })}
              onNodeDelete={(nodeId) => deleteNode(nodeId)}
            />
          )}

          {/* Properties Panel - Moved inside canvas wrapper so height aligns exactly */}
          {!showRawJson && (
            <NodePropertiesPanel
              node={editorState.nodes.find((n) => n.id === editorState.selectedNodeId) ?? null}
              allNodes={editorState.nodes}
              agents={agents}
              isOpen={!!editorState.selectedNodeId}
              onClose={() => updateState({ selectedNodeId: null })}
              onUpdate={(nodeId, updates) => {
                updateState({
                  nodes: editorState.nodes.map((n) =>
                    n.id === nodeId ? { ...n, ...updates } : n
                  ),
                });
              }}
              onAdd={(type) => addNode(type)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addNode("task")}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Task
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addNode("approval_gate")}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Gate
              </Button>
              <span className="text-xs text-muted-foreground">
                {editorState.nodes.length} node{editorState.nodes.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={!editorState.name || editorState.nodes.length === 0 || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1.5" />
                )}
                {editorState.templateId ? "Save Changes" : "Create Template"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
