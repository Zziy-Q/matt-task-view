---
name: matt-task-view
description: "Matt Dev View companion for Matt Pocock Skills: after a formal spec, enforce the architecture-impact gate before /to-tickets; after tickets, open the read-only dependency view in the Codex right sidebar before /implement; also use when the user says '启动开发任务视图'."
---

# Matt Dev View

Matt Pocock Skills 负责规划与实施，Matt Dev View 负责只读展示开发过程。本技能连接本地 Markdown 开发流与视图。票据、架构四件套和项目基线始终是事实来源；任务视图只读取、校验和展示，绝不代替用户批准、复制基线或修改票据。

## 配套前提

- 完整开发流程需先安装 [Matt Pocock Skills](https://github.com/mattpocock/skills)，并在目标仓库通过 `setup-matt-pocock-skills` 配置本地 Markdown tracker；开发任务由 `ask-matt` 路由至对应技能。
- 本技能是独立的 companion 适配，不包含上游开发技能。架构门禁、票据 frontmatter 和自动打开 Codex 侧栏是本项目的约定，需在正式规格完成后、`to-tickets` 前加载。
- 规格使用 `.scratch/<feature>/spec.md`，票据按 [ticket-contract.md](./references/ticket-contract.md) 保存到 `.scratch/<feature>/issues/`；本视图不读取远端 issue tracker。
- 任务视图服务不在运行时调用 Skills。已有符合契约的文件可独立查看；启动视图不会生成规格、票据或执行代码开发。

启动前先确认 `matt-task-view` 命令可用；安装与路径配置见工具仓库 README。若使用绝对路径启动，从目标项目根目录执行 `node /实际路径/matt-task-view/src/cli.mjs serve --port 0`，不要切换到工具目录读取错项目。

## 1. 在任务拆分前完成架构门禁

固定顺序是：**正式规格完成 → 架构影响判断 → `/to-tickets` 发布票据**。不得先发布 issues 再补架构决定。

先读取 [architecture-contract.md](./references/architecture-contract.md) 的完整 JSON 与内置 Archify 命令。在 `.scratch/<feature>/architecture/decision.json` 记录是否存在组件、接口、数据流、信任边界、外部依赖或部署结构变化；`schemaVersion: 1`、`required`、`mode`、`reason` 均必填：

- 无架构影响时写 `required=false`，并填写非空的中文跳过理由 `reason`；不得用缺少架构目录代替决定。
- `greenfield` 从“规划架构 v0”开始，当前架构为不存在，不制造现状图。
- `existing` 先读取已验证的 `docs/architecture/` 项目基线，并用 `currentBaselineSpecificationSha256` 固定该基线；没有可信匹配时先恢复并由用户确认当前基线。

需要架构时，用 Archify 公共命令 `validate` 和 `deliver` 生成结构化 JSON、展示 HTML 与回执。工具校验通过不等于明确的用户批准。只有用户明确批准当前 JSON 与 HTML 的精确 SHA-256，并把批准摘要写入决定后，规划门禁才通过。门禁未通过时不得发布 `.scratch/<feature>/issues/`。

## 2. 发布可追溯票据

读取 [ticket-contract.md](./references/ticket-contract.md)。`/to-tickets` 只为已批准规划架构或有非空跳过理由的功能发布票据。架构相关票据必须填写批准的 `architecture_revision` 和稳定组件 ID 组成的 `affects`；`depends_on` 仍只表达任务执行依赖。

保留 Matt 标题、`Blocked by`、triage `Status` 和 checklist。开发状态更新到 frontmatter 的 `status`；正文 triage `Status` 仍只表示分诊角色。验收清单按实际实现与验收记录独立更新，不随工单 `done` 自动勾选。

## 3. 自动打开只读任务视图

`/to-tickets` 写完本地票据后、首次 `/implement` 前，自动完成以下两步，不等待用户再次输入“启动开发任务视图”：

1. 从仓库根目录运行 `matt-task-view serve --port 0`；优先复用同一仓库已有且健康的 `127.0.0.1` 服务，并取得 `开发任务视图:` URL。
2. 在同一回合调用 Codex `open_in_codex`，以浏览器目标和 `placement: "right"` 打开该 URL。

用户直接说“启动开发任务视图”时也执行这两步。使用当前对话的仓库根目录；若没有 `.scratch/`，说明需要 Matt 本地票据仓库，不搜索无关目录。

## 4. 实施与架构闭环

- 架构事实源在实施中变化时，不领取新的 ready 工单；in_progress 工单完成当前安全检查点后暂停，等待重新交付和批准。
- 全部工单 done 后，在 `.scratch/<feature>/architecture/actual/` 生成 `recordType="actual-review"` 的实际架构四件套，逐项记录规划／实际差异。
- 工具交付、工具校验、实现完成和用户批准是四个独立事实。实际架构只有在 `approvedSpecificationSha256`、`approvedArtifactSha256` 与覆盖复核说明和差异的 `approvedReviewSha256` 都精确匹配时才算显式批准。
- 批准后的实际四件套由外部流程逐字节复制到 `docs/architecture/`。任务视图只读验证，不创建目录、不复制文件，也不提供批准按钮。

## Completion

视图准备完成的条件：快照无计划诊断，摘要、依赖图、任务列表和开发前沿与本地票据一致；架构门禁和生命周期与四件套校验结果一致。
