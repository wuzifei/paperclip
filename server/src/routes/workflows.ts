import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { workflowService, issueService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function workflowRoutes(db: Db) {
  const router = Router();
  const wfSvc = workflowService(db);
  const issueSvc = issueService(db);

  // ---- Templates ----

  router.get("/companies/:companyId/workflows/templates", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const templates = await wfSvc.listTemplates(companyId);
    res.json(templates);
  });

  router.get("/companies/:companyId/workflows/templates/:templateId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const template = await wfSvc.getTemplate(companyId, req.params.templateId as string);
    res.json(template);
  });

  router.post("/companies/:companyId/workflows/templates", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const template = await wfSvc.createTemplate(companyId, {
      ...req.body,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "workflow_template.created",
      entityType: "workflow_template",
      entityId: template.id,
      details: { name: template.name },
    });
    res.status(201).json(template);
  });

  router.patch("/companies/:companyId/workflows/templates/:templateId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const template = await wfSvc.updateTemplate(
      companyId,
      req.params.templateId as string,
      req.body,
    );
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "workflow_template.updated",
      entityType: "workflow_template",
      entityId: template.id,
      details: req.body,
    });
    res.json(template);
  });

  router.delete("/companies/:companyId/workflows/templates/:templateId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const deleted = await wfSvc.deleteTemplate(companyId, req.params.templateId as string);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "workflow_template.deleted",
      entityType: "workflow_template",
      entityId: deleted.id,
      details: { name: deleted.name },
    });
    res.json({ ok: true });
  });

  // ---- Instances ----

  router.get("/companies/:companyId/workflows/instances", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const instances = await wfSvc.listInstances(companyId);
    res.json(instances);
  });

  router.get("/companies/:companyId/workflows/instances/:instanceId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const instance = await wfSvc.getInstance(companyId, req.params.instanceId as string);
    res.json(instance);
  });

  /**
   * Instantiate a workflow template.
   *
   * Body: { templateId, variables: { feature_name: "..." }, projectId?, goalId? }
   *
   * Creates all Issues with blockedBy relations and returns the
   * workflow instance with its nodeIssueMap.
   */
  router.post("/companies/:companyId/workflows/instantiate", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);

    const { templateId, variables, projectId, goalId } = req.body as {
      templateId: string;
      variables: Record<string, string>;
      projectId?: string;
      goalId?: string;
    };

    const result = await wfSvc.instantiate(
      {
        companyId,
        templateId,
        variables: variables ?? {},
        createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        projectId: projectId ?? null,
        goalId: goalId ?? null,
      },
      (cId, data) => issueSvc.create(cId, data),
    );

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "workflow_instance.created",
      entityType: "workflow_instance",
      entityId: result.instance.id,
      details: { templateId, variables, nodeCount: Object.keys(result.nodeIssueMap).length },
    });

    res.status(201).json(result);
  });

  router.patch("/companies/:companyId/workflows/instances/:instanceId", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const { status } = req.body as { status: string };
    const instance = await wfSvc.updateInstanceStatus(
      companyId,
      req.params.instanceId as string,
      status,
    );
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "workflow_instance.updated",
      entityType: "workflow_instance",
      entityId: instance.id,
      details: { status },
    });
    res.json(instance);
  });

  return router;
}
