import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workflowsApi, type WorkflowTemplate, type WorkflowNodeDef } from "../api/workflows";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { GitBranch, Plus, Play, Trash2, ChevronRight, ShieldCheck, Cog } from "lucide-react";

// ---------------------------------------------------------------------------
// Workflow Templates list page
// ---------------------------------------------------------------------------

export function Workflows() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showInstantiateFor, setShowInstantiateFor] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Workflows" }]);
  }, [setBreadcrumbs]);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["workflows", "templates", selectedCompanyId],
    queryFn: () => workflowsApi.listTemplates(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: instances } = useQuery({
    queryKey: ["workflows", "instances", selectedCompanyId],
    queryFn: () => workflowsApi.listInstances(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      workflowsApi.deleteTemplate(selectedCompanyId!, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows", "templates", selectedCompanyId] });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={GitBranch} message="Select a company to view workflows." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-6">
      {/* ---- SOP Templates Section ---- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">SOP Templates</h2>
          <Button size="sm" variant="outline" onClick={() => setShowCreateForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Template
          </Button>
        </div>

        {showCreateForm && (
          <CreateTemplateForm
            companyId={selectedCompanyId}
            onCreated={() => {
              setShowCreateForm(false);
              queryClient.invalidateQueries({ queryKey: ["workflows", "templates", selectedCompanyId] });
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {templates && templates.length === 0 && !showCreateForm && (
          <EmptyState
            icon={GitBranch}
            message="No SOP templates yet. Create one to define your development pipeline."
            action="Create Template"
            onAction={() => setShowCreateForm(true)}
          />
        )}

        {templates && templates.length > 0 && (
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{tpl.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {tpl.nodes.length} nodes
                    </span>
                  </div>
                  {tpl.description && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">{tpl.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tpl.nodes.map((node) => (
                      <span
                        key={node.id}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          node.type === "approval_gate"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        }`}
                      >
                        {node.type === "approval_gate" ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <Cog className="h-3 w-3" />
                        )}
                        {node.title.replace(/\{\{.*?\}\}/g, "...")}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <Button size="sm" variant="default" onClick={() => setShowInstantiateFor(tpl.id)}>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Run
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete template "${tpl.name}"?`)) {
                        deleteMutation.mutate(tpl.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showInstantiateFor && (
          <InstantiateModal
            companyId={selectedCompanyId}
            template={templates?.find((t) => t.id === showInstantiateFor) ?? null}
            onDone={() => {
              setShowInstantiateFor(null);
              queryClient.invalidateQueries({ queryKey: ["workflows", "instances", selectedCompanyId] });
            }}
            onCancel={() => setShowInstantiateFor(null)}
          />
        )}
      </section>

      {/* ---- Active Workflow Instances Section ---- */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Active Pipelines</h2>
        {instances && instances.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No active pipelines. Run a template to start one.
          </p>
        )}
        {instances && instances.length > 0 && (
          <div className="space-y-2">
            {instances.map((inst) => {
              const nodeCount = Object.keys(inst.nodeIssueMap).length;
              return (
                <div
                  key={inst.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{inst.name}</span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          inst.status === "active"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                            : inst.status === "completed"
                              ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        }`}
                      >
                        {inst.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nodeCount} issues created
                      {inst.variables && Object.keys(inst.variables).length > 0 && (
                        <span className="ml-2">
                          {Object.entries(inst.variables)
                            .map(([k, v]) => `${k}="${v}"`)
                            .join(", ")}
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Template Form (inline)
// ---------------------------------------------------------------------------

function CreateTemplateForm(props: {
  companyId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodesJson, setNodesJson] = useState<string>(
    JSON.stringify(
      [
        { id: "n1_prd", type: "task", title: "[PRD] {{feature_name}}", assigneeRole: "product-manager", description: "Design the PRD" },
        { id: "n2_prd_review", type: "approval_gate", title: "Review PRD", assigneeRole: "human", blockedBy: ["n1_prd"] },
        { id: "n3_ux", type: "task", title: "[UX] {{feature_name}}", assigneeRole: "ux-designer", blockedBy: ["n2_prd_review"] },
        { id: "n4_ux_review", type: "approval_gate", title: "Review UX", assigneeRole: "human", blockedBy: ["n3_ux"] },
        { id: "n5_dev", type: "task", title: "[Dev] {{feature_name}}", assigneeRole: "developer", blockedBy: ["n4_ux_review"] },
      ],
      null,
      2,
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      let nodes: WorkflowNodeDef[];
      try {
        nodes = JSON.parse(nodesJson);
      } catch {
        throw new Error("Invalid JSON in nodes definition");
      }
      return workflowsApi.createTemplate(props.companyId, { name, description: description || undefined, nodes });
    },
    onSuccess: () => props.onCreated(),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3">
      <h3 className="text-sm font-semibold">New SOP Template</h3>
      <div>
        <label className="text-xs text-muted-foreground">Name</label>
        <input
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Feature Pipeline"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <input
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Standard feature development SOP"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">
          Pipeline Nodes (JSON) — use {"{{variable}}"} for template variables
        </label>
        <textarea
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-relaxed"
          rows={14}
          value={nodesJson}
          onChange={(e) => setNodesJson(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>
          {mutation.isPending ? "Creating..." : "Create Template"}
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instantiate Modal (overlay)
// ---------------------------------------------------------------------------

function InstantiateModal(props: {
  companyId: string;
  template: WorkflowTemplate | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { template } = props;

  // Extract {{variable}} placeholders from all node titles/descriptions
  const variableNames = new Set<string>();
  if (template) {
    for (const node of template.nodes) {
      const matches = (node.title + " " + (node.description ?? "")).matchAll(/\{\{(\w+)\}\}/g);
      for (const m of matches) {
        variableNames.add(m[1]);
      }
    }
  }

  const [variables, setVariables] = useState<Record<string, string>>(
    Object.fromEntries([...variableNames].map((k) => [k, ""])),
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      workflowsApi.instantiate(props.companyId, {
        templateId: template!.id,
        variables,
      }),
    onSuccess: () => props.onDone(),
    onError: (err: Error) => setError(err.message),
  });

  if (!template) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-card border border-border p-6 shadow-lg space-y-4">
        <h3 className="text-base font-semibold">Run: {template.name}</h3>
        <p className="text-xs text-muted-foreground">
          This will create {template.nodes.length} issues with dependency gates.
        </p>

        {[...variableNames].map((varName) => (
          <div key={varName}>
            <label className="text-xs text-muted-foreground">{varName}</label>
            <input
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={variables[varName] ?? ""}
              onChange={(e) => setVariables({ ...variables, [varName]: e.target.value })}
              placeholder={`Enter ${varName}`}
            />
          </div>
        ))}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || [...variableNames].some((k) => !variables[k])}
          >
            <Play className="h-3.5 w-3.5 mr-1" />
            {mutation.isPending ? "Creating pipeline..." : "Start Pipeline"}
          </Button>
          <Button size="sm" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
