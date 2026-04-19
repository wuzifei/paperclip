# Paperclip 新特性使用教程：SOP 引擎、分层记忆与通知渠道

该文档描述了 Paperclip 平台最新引入的三大核心功能模块：**分层记忆系统 (Layered Memory)**、**SOP 工作流引擎 (Workflow)** 和 **通知调度渠道 (Notification Channels)**。

## 1. 分层记忆系统 (Layered Memory System)
该特性允许通过文件系统上的 Markdown 文件动态为 Agent 提供多层级的知识上下文注入（Context Injection），用于规范化 AI 在具体项目或工单中的行为边界。

### 1.1 存储结构及生效范围
默认记忆根目录为 `.paperclip/memory/`（可通过环境变量 `PAPERCLIP_MEMORY_DIR` 覆盖）。支持 3 层上下文提取：

* **L1 层：项目全局规则 (Project Global)**
  * **位置**：`.paperclip/memory/project_global.md`
  * **作用域**：注入到所有 Agent 的提示词中，代表项目级别的刚性要求。
* **L2 层：特定 Agent 规则 (Agent-Specific)**
  * **位置**：`.paperclip/memory/agents/{agentNameKey}/rules.md`（同时也支持寻找 `identity.md` 或 `specs.md`）
  * **作用域**：仅针对调用的指定 Agent 生效，提供职责说明和行为规范。
* **L3 层：特定工单上下文 (Ticket-Specific)**
  * **位置**：`.paperclip/memory/tickets/{issueId}.md`
  * **作用域**：挂载在特定 Issue ID 下的详细背景，用于限定某个工单的上下文。

### 1.2 运行机制
系统在每次 Agent 调度时调用 `assembleMemoryContext`。它会扫描这三个层级的文件，将读取到的非空 Markdown 文件拼接在定界符（如 `=== [Project Rules] ===`）中，形成一整块系统注入字符串，确保 AI 可以严谨遵守各层约束。

## 2. SOP 工作流引擎 (SOP Engine Workflow)
SOP 引擎通过有向无环图（DAG）实现标准化流程节点的编排、实例化和依赖解决。

### 2.1 模板与节点依赖
工作流由模板 (`workflowTemplates`) 驱动，模板内包含一组 `WorkflowNodeDef`（包含节点标题、描述、类型和依赖等信息）。
* **变量占位符**：节点标题与描述支持 Mustache 分格的插值语法，例如：`{{featureName}}`。在实例化时会通过 `variables` 字典动态替换。
* **拓扑排序支持**：如果存在多节点之间的前后阻塞关系，只需在节点上配置 `blockedBy`（存放被依赖节点的 ID 列表）。后台会自动进行拓扑排序，按正确依赖顺序流式创建工单（Issue）。

### 2.2 实例化流程
当业务调用 `instantiate(input)` 时：
1. 引擎执行变量插值。
2. 进行拓扑排序。
3. 循环按顺序调用外部注入的方法将节点实体化为 Issue，若原模板节点上标记为 `approval_gate`，则对应工单会被指派给人类执行者处理。
4. 返回与相关联的 `nodeIssueMap`（节点 ID 到真实工单 ID 的映射）。

## 3. 审批与通知渠道 (Notification Channels)
审批通知分发机制能够在审批事件（如 `approval_pending`, `approval_approved` 等）发生时，自动通过不同 IM 端或业务端进行推送调度。

### 3.1 预设渠道与配置
现已实现以下三种原生通知协议：
1. **Feishu / Lark (飞书机器人网页钩子)**
   * 发送含有状态颜色的交互式消息卡片 (Interactive Card)。
   * 如果属于待审批 (`approval_pending`) 且配置了回传 URL，甚至会通过卡片附加 **“Approve (批准)”** 与 **“Reject (拒绝)”** 按钮。
2. **OpenClaw**
   * 用于内部或专属系统回调。抛出带有 JSON 事件特征 `paperclip.approval` 的报文并支持传递 API Key。
3. **Generic Webhook**
   * 通用标准外发 Webhook，通过 `X-Paperclip-Secret` 传递密钥头。

### 3.2 运行调度 (`notification-dispatcher.ts`)
只需使用 `notificationDispatcherService.dispatchApprovalEvent()`，引擎会自动从数据库查找当前实体公司下启用的 Channel。补齐 Issue 与 Workflow 上下文后进行 **Fan-out（扇出调度）** 并发推送。