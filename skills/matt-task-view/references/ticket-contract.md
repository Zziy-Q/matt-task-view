# 任务视图票据契约

每张可视化票据都以以下 frontmatter 开头：

```yaml
---
id: "01"
status: ready
depends_on: []
blocked_reason: ""
phase: "实现"
architecture_revision: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
affects:
  - "api"
---
```

## 任务字段

- `id` 在同一功能目录内唯一；文件名和组件引用使用不会随中文标签变化的稳定 ID。
- `status` 只能是 `ready`、`in_progress`、`blocked`、`done`。
- `depends_on` 只列任务执行前必须完成的本地 ID，跨功能依赖写成 `feature/id`。
- `blocked_reason` 在 `status=blocked` 时必须非空。
- `phase` 可选，省略时显示“未分阶段”。

保留 Matt 单独的 `**Status:** ready-for-agent` triage 行；frontmatter 的 `status` 才是实时开发状态。

## 架构追溯字段

- `architecture_revision` 是当前用户已批准规划架构源的 64 位小写十六进制 SHA-256；不得填写 HTML 摘要、旧修订或工具校验结果。
- `affects` 是非空的 Archify 稳定组件 ID 列表；显示标签可以改，稳定组件 ID 不随标签变化。
- `affects` 不生成也不修改 `depends_on`。架构关系描述系统结构，`depends_on` 才形成任务执行 DAG。
- 架构门禁未通过时不得发布票据；每张需要架构的票据必须同时有有效的 `architecture_revision` 和 `affects`。
- 对 `required=false` 且有非空跳过理由的功能，不伪造 `architecture_revision` 或 `affects`；这两个字段应省略。

## 验收标记

Acceptance criteria use three local Markdown markers:

- `[ ]` 表示未勾选、待核对，显示为 `○`；不能据此判断代码尚未实现。
- `[~]` 表示已实现但尚未验收，显示为绿色 `▲`。
- `[x]` 表示验收完成，显示为 `☑`。

只有 `[x]` 计为验收完成。工单 `status: done` 与验收记录独立，不自动勾选清单，也不代表已交付。

无架构影响的完整 `decision.json`、规划与实际复核模板见 [架构契约](./architecture-contract.md)。
