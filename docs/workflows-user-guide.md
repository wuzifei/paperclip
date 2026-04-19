# Paperclip Workflows (SOP 引擎) 使用教程

## 一、功能概述

Workflows 是 Paperclip 新增的 **SOP（Standard Operating Procedure）工作流引擎**，它允许你定义标准化的开发流程模板，并通过变量插值自动创建一系列相互依赖的工单（Issues）。

**核心能力：**
- 📋 定义可复用的流程模板
- 🔗 节点间依赖关系自动处理
- ⚙️ 变量插值动态生成内容
- 🛡️ 审批节点支持人工干预
- 📊 流水线实例可视化追踪

---

## 二、界面导览

```
┌─────────────────────────────────────────────────────────────────────┐
│  Paperclip Workflows                                            🏠  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ SOP Templates ────────────────────────────────────────────┐     │
│  │                                                              │     │
│  │  ┌─────────────────────────────────────────────────────┐   │     │
│  │  │ 🌿 Feature Development Pipeline             [5 nodes] │   │     │
│  │  │    Standard feature development SOP                 │   │     │
│  │  │    🛡️ [PRD] {{feature_name}}                         │   │     │
│  │  │    ⚙️ Review PRD                                    │   │     │
│  │  │    ⚙️ [UX] {{feature_name}}                          │   │     │
│  │  │    🛡️ Review UX                                     │   │     │
│  │  │    ⚙️ [Dev] {{feature_name}}                         │   │     │
│  │  │                        [▶ Run] [🗑]                 │   │     │
│  │  └─────────────────────────────────────────────────────┘   │     │
│  │                                                              │     │
│  │  [+ New Template]                                             │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌─ Active Pipelines ─────────────────────────────────────────┐     │
│  │                                                              │     │
│  │  🔵 User Login Feature                    [active]         │     │
│  │      5 issues created (feature_name="User Login Feature") → │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、创建 SOP 模板

### 3.1 进入创建页面

1. 在左侧导航栏选择 **Workflows**
2. 点击 **[+ New Template]** 按钮

### 3.2 模板配置

创建模板时需要填写以下信息：

| 字段 | 说明 | 示例 |
|------|------|------|
| **Name** | 模板名称 | Feature Development Pipeline |
| **Description** | 模板描述 | Standard feature development SOP |
| **Pipeline Nodes (JSON)** | 流程节点定义（JSON数组） | 见下方示例 |

### 3.3 节点定义语法

每个节点包含以下字段：

```json
{
  "id": "节点唯一标识",
  "type": "task 或 approval_gate",
  "title": "任务标题，支持 {{变量}}",
  "assigneeRole": "角色名称",
  "description": "可选的详细描述",
  "blockedBy": ["依赖的节点ID"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 节点的唯一标识符 |
| `type` | string | `task` = AI任务，`approval_gate` = 人工审批 |
| `title` | string | 工单标题，支持变量插值 `{{varName}}` |
| `assigneeRole` | string | 执行角色标识 |
| `description` | string | 可选的任务描述 |
| `blockedBy` | string[] | 依赖的节点ID列表 |

---

## 四、模板示例

### 4.1 基础功能开发流程

```json
[
  {
    "id": "n1_prd",
    "type": "task",
    "title": "[PRD] {{feature_name}}",
    "assigneeRole": "product-manager",
    "description": "编写产品需求文档"
  },
  {
    "id": "n2_prd_review",
    "type": "approval_gate",
    "title": "Review PRD",
    "assigneeRole": "human",
    "blockedBy": ["n1_prd"]
  },
  {
    "id": "n3_ux",
    "type": "task",
    "title": "[UX] {{feature_name}}",
    "assigneeRole": "ux-designer",
    "blockedBy": ["n2_prd_review"]
  },
  {
    "id": "n4_dev",
    "type": "task",
    "title": "[Dev] {{feature_name}}",
    "assigneeRole": "developer",
    "blockedBy": ["n3_ux"]
  },
  {
    "id": "n5_test",
    "type": "task",
    "title": "[Test] {{feature_name}}",
    "assigneeRole": "qa-engineer",
    "blockedBy": ["n4_dev"]
  }
]
```

**流程图：**

```
[n1_prd] → [n2_prd_review] → [n3_ux] → [n4_dev] → [n5_test]
  📝          🛡️审批          🎨        💻         ✅
```

### 4.2 带多依赖的复杂流程

```json
[
  {
    "id": "n1_frontend",
    "type": "task",
    "title": "[Frontend] {{feature_name}}",
    "assigneeRole": "frontend-dev"
  },
  {
    "id": "n2_backend",
    "type": "task",
    "title": "[Backend] {{feature_name}}",
    "assigneeRole": "backend-dev"
  },
  {
    "id": "n3_integration",
    "type": "task",
    "title": "[Integration] {{feature_name}}",
    "assigneeRole": "fullstack-dev",
    "blockedBy": ["n1_frontend", "n2_backend"]
  },
  {
    "id": "n4_deploy",
    "type": "approval_gate",
    "title": "Deploy {{feature_name}}",
    "assigneeRole": "human",
    "blockedBy": ["n3_integration"]
  }
]
```

**流程图：**

```
        ┌── [n1_frontend] ──┐
        │                  ↓
[n2_backend]          [n3_integration] → [n4_deploy]
        │                  💻              🛡️
        └──────────────────┘
```

---

## 五、运行模板

### 5.1 启动流程

1. 找到要运行的模板卡片
2. 点击 **[▶ Run]** 按钮
3. 在弹出窗口中填写变量值

### 5.2 变量填写界面

```
┌─────────────────────────────────────────┐
│  Run: Feature Development Pipeline      │
├─────────────────────────────────────────┤
│  This will create 5 issues with         │
│  dependency gates.                       │
│                                          │
│  feature_name                            │
│  ┌─────────────────────────────────┐   │
│  │ User Login System              │   │
│  └─────────────────────────────────┘   │
│                                          │
│  [▶ Start Pipeline] [Cancel]             │
└─────────────────────────────────────────┘
```

### 5.3 生成的工单结构

运行模板后，系统会自动创建以下工单：

| 工单标题 | 状态 | 依赖 |
|----------|------|------|
| [PRD] User Login System | backlog | 无 |
| Review PRD | backlog | n1_prd |
| [UX] User Login System | blocked | n2_prd_review |
| [Dev] User Login System | blocked | n3_ux |
| [Test] User Login System | blocked | n4_dev |

---

## 六、节点类型说明

### 6.1 Task（任务节点）

- **图标**: ⚙️ 齿轮
- **颜色**: 蓝色
- **用途**: 由 AI Agent 执行的任务
- **示例**: 编写代码、设计文档、编写测试

### 6.2 Approval Gate（审批节点）

- **图标**: 🛡️ 盾牌
- **颜色**: 琥珀色
- **用途**: 需要人工审批的关卡
- **自动分配**: 审批节点自动分配给发起流程的用户
- **通知**: 支持通过飞书/Slack 等渠道发送审批通知

---

## 七、最佳实践

### 7.1 变量命名规范

```json
{
  "id": "n1",
  "title": "Implement {{feature_name}} for {{client_name}}"
}
```

推荐使用语义化的变量名：
- `{{feature_name}}` - 功能名称
- `{{client_name}}` - 客户名称
- `{{ticket_id}}` - 关联工单ID
- `{{deadline}}` - 截止日期

### 7.2 节点 ID 命名建议

```json
{
  "id": "n1_prd",           // 阶段序号_类型
  "id": "phase1_review",    // 阶段_动作
  "id": "backend_api"       // 模块_组件
}
```

### 7.3 描述模板

在 `description` 字段中可以添加详细的指导信息：

```json
{
  "id": "n1_prd",
  "title": "[PRD] {{feature_name}}",
  "description": "请编写完整的产品需求文档，包括：\n1. 功能概述\n2. 用户故事\n3. 验收标准\n4. 技术要求"
}
```

---

## 八、常见问题

### Q1: 如何修改已创建的模板？

目前需要删除后重新创建。模板一旦实例化，不会影响已生成的工单。

### Q2: 审批节点如何通知？

审批节点会自动分配给发起流程的用户，如果配置了通知渠道（如飞书机器人），会收到审批提醒。

### Q3: 可以嵌套使用模板吗？

当前版本暂不支持模板嵌套，但可以通过创建多个独立的模板来实现复杂流程。

### Q4: 如何查看流水线执行状态？

在 **Active Pipelines** 区域可以看到所有活跃的流水线及其状态：
- `active` - 运行中
- `completed` - 已完成
- 其他状态 - 异常/暂停

---

## 九、API 使用（开发者参考）

### 创建模板

```bash
POST /api/companies/{companyId}/workflows/templates
Content-Type: application/json

{
  "name": "Feature Pipeline",
  "description": "Standard feature development",
  "nodes": [
    {
      "id": "n1",
      "type": "task",
      "title": "[Task] {{feature}}",
      "assigneeRole": "developer"
    }
  ]
}
```

### 实例化模板

```bash
POST /api/companies/{companyId}/workflows/instantiate
Content-Type: application/json

{
  "templateId": "template-uuid",
  "variables": {
    "feature": "User Authentication"
  },
  "projectId": "project-uuid",
  "goalId": "goal-uuid"
}
```

---

## 十、后续计划

- [ ] 可视化流程编辑器（拖拽式）
- [ ] 模板版本管理
- [ ] 流程执行历史追踪
- [ ] 条件分支支持
- [ ] 并行任务合并节点
