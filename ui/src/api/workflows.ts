import { api } from "./client";

export interface WorkflowNodeDef {
  id: string;
  type: "task" | "approval_gate";
  title: string;
  assigneeRole: string;
  description?: string;
  blockedBy?: string[];
  position?: { x: number; y: number }; // <-- Added explicitly so TS is completely happy with JSON serialization
}

export interface WorkflowTemplate {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  nodes: WorkflowNodeDef[];
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowInstance {
  id: string;
  companyId: string;
  templateId: string;
  name: string;
  status: string;
  variables: Record<string, string>;
  nodeIssueMap: Record<string, string>;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstantiateResult {
  instance: WorkflowInstance;
  nodeIssueMap: Record<string, string>;
}

export const workflowsApi = {
  // Templates
  listTemplates: (companyId: string) =>
    api.get<WorkflowTemplate[]>(`/companies/${companyId}/workflows/templates`),
  getTemplate: (companyId: string, templateId: string) =>
    api.get<WorkflowTemplate>(`/companies/${companyId}/workflows/templates/${templateId}`),
  createTemplate: (companyId: string, data: { name: string; description?: string; nodes: WorkflowNodeDef[] }) =>
    api.post<WorkflowTemplate>(`/companies/${companyId}/workflows/templates`, data),
  updateTemplate: (companyId: string, templateId: string, data: Partial<{ name: string; description: string; nodes: WorkflowNodeDef[] }>) =>
    api.patch<WorkflowTemplate>(`/companies/${companyId}/workflows/templates/${templateId}`, data),
  deleteTemplate: (companyId: string, templateId: string) =>
    api.delete<{ ok: boolean }>(`/companies/${companyId}/workflows/templates/${templateId}`),

  // Instances
  listInstances: (companyId: string) =>
    api.get<WorkflowInstance[]>(`/companies/${companyId}/workflows/instances`),
  getInstance: (companyId: string, instanceId: string) =>
    api.get<WorkflowInstance>(`/companies/${companyId}/workflows/instances/${instanceId}`),
  instantiate: (companyId: string, data: { templateId: string; variables: Record<string, string>; projectId?: string; goalId?: string }) =>
    api.post<InstantiateResult>(`/companies/${companyId}/workflows/instantiate`, data),
  updateInstance: (companyId: string, instanceId: string, data: { status: string }) =>
    api.patch<WorkflowInstance>(`/companies/${companyId}/workflows/instances/${instanceId}`, data),
};
