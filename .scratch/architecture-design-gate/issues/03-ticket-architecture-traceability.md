---
id: "03"
status: done
depends_on:
  - "02"
blocked_reason: ""
phase: "任务追溯"
architecture_revision: "22a77a88c144e7bfc649f20b6b5c2a13c70c2eeea6d3fd584895a8f96ef8f5f0"
affects:
  - "tickets"
  - "approval"
---

# 03: 让工单与架构修订和组件可追溯

**What to build:** 用户可以从每张开发工单追溯到拆票时批准的架构修订和受影响组件；修订不一致的工单不会被当作可安全执行的开发前沿。

**Blocked by:** 02: 在 SDD 中安全展示中文架构阶段卡片.

**Status:** ready-for-agent

- [x] 解析工单 frontmatter 中的 `architecture_revision` 和 `affects`；修订必须是 64 位十六进制，组件 ID 必须存在，需要架构的工单必须同时具备两项元数据，诊断包含票据路径。
- [x] 工单修订与当前批准修订不一致，或批准本身不匹配时，该工单不能进入 ready 开发前沿。
- [x] 架构卡片列出绑定工单及受影响组件的中文名称；任务详情列出其 `affects` 组件。
- [x] 从工单聚焦架构组件时使用稳定组件 ID，不读取 iframe DOM，也不引入 `postMessage` 协议。
- [x] 任务依赖图仍只由 `depends_on` 决定，架构关联不会伪造成任务依赖；回归测试覆盖解析、诊断、门禁和展示。

## Comments

- 2026-09-03：`npm test` 43/43 通过；覆盖工单元数据解析、逐工单诊断、架构修订门禁、`source_changed` 隔离、中文组件展示和稳定组件 ID 聚焦链接。
- 2026-09-03：审查修复后 `npm test` 50/50 通过；缺少绑定元数据的工单仍显示中文诊断，任务计划不会误报完成，组件结构严格校验，超长组件聚焦标签可换行且普通文本对比度不低于 4.5:1。
