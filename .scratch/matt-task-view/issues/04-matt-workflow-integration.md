---
id: "04"
status: done
depends_on:
  - "03"
blocked_reason: ""
phase: "工作流联动"
---

# 04: 将任务视图接入全局 Matt 工作流

**What to build:** 用户在任何已采用本地 Markdown tracker 的 Matt 仓库中完成 `to-tickets` 后，能按一个 companion skill 启动或复用任务视图，并在第一次 `implement` 前将该页面打开到 Codex 右侧；新票据模板天然满足视图元数据契约。

**Blocked by:** 03: 在右侧页面呈现流程任务图.

**Status:** ready-for-agent

- [ ] companion skill 明确在 `to-tickets` 后、首次 `implement` 前触发，且不替代 Matt 原有的规格、票据、测试或代码评审流程。
- [ ] 新票据模板包含任务视图所需的 frontmatter，同时保留 Matt 的标题、`Blocked by`、triage `Status` 和验收清单约定。
- [ ] 按 Codex 支持的右侧浏览器面板方式打开回环地址；无法打开时仍输出可复制的本地地址与诊断。
- [ ] 以全新临时仓库完成一次从票据到任务图、状态更新、右侧页面打开指令的端到端验证。
