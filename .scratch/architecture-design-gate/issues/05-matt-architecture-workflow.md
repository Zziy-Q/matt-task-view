---
id: "05"
status: done
depends_on:
  - "04"
blocked_reason: ""
phase: "流程接入"
architecture_revision: "22a77a88c144e7bfc649f20b6b5c2a13c70c2eeea6d3fd584895a8f96ef8f5f0"
affects:
  - "spec"
  - "impact"
  - "tickets"
---

# 05: 接入 Matt companion 架构开发流程

**What to build:** 用户在 Matt 本地 Markdown 开发流中完成正式规格后，先判断架构影响、按需设计和批准架构，再发布带修订关联的工单；原有“to-tickets 后、首次 implement 前自动打开任务视图”保持不变。

**Blocked by:** 04: 闭环架构过期、实际架构与长期基线.

**Status:** done

- [x] companion 文档要求在正式规格之后、`to-tickets` 之前完成架构影响判断；跳过架构设计必须填写非空理由。
- [x] 文档覆盖全新项目 planned v0、既有项目架构恢复、Archify `validate` 与 `deliver`、以及按精确 SHA 显式批准。
- [x] 票据契约加入 `architecture_revision` 和 `affects`，需要架构却未通过门禁时不得发布开发工单。
- [x] `to-tickets` 完成后、首次 `implement` 前自动启动或复用任务视图的既有流程继续生效。
- [x] 实现只修改本地 Markdown companion 与任务视图，不创建上游 PR、不操作远端 tracker、不安装依赖。
- [x] 用本功能完成一次从规格、架构批准、五张票据、任务视图到闭环状态的文档与测试验证。

## Comments

- 2026-09-03：新增 Node 文档契约测试，覆盖正式规格 → 架构影响判断 → `to-tickets` 的顺序、票据架构字段、同回合右侧任务视图以及实际架构闭环的只读边界。
- 2026-09-03：使用 Archify 公共 `validate` 与 `deliver` 命令生成 actual 四件套；showcase 校验 9/9，errors=0、warnings=0。实际 JSON/HTML 与批准规划工件逐字节一致，decision 未写任何 `approved*` 字段，未创建 `docs/architecture/`。
- 2026-09-03：最终 `npm test` 80/80 通过。真实 `buildTaskGraph` 快照为：规划 `status=approved`、`workflowStatus=actual_pending_review`、`implementationComplete=true`、`deliveryVerified=true`、`toolValidationPassed=true`、`userApproved=false`、`projectBaseline=missing`、`errors=[]`、`frontier=[]`。
