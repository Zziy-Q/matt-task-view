---
id: "01"
status: done
depends_on: []
blocked_reason: ""
phase: "任务模型"
---

# 01: 构建可校验的任务图快照

**What to build:** 用户可以针对仓库的本地 `.scratch/<feature>/issues/` 票据生成一个可读取的任务图快照，得到功能、阶段、任务、依赖、开发前沿、完成率和验收清单；损坏计划会返回可定位的错误而不是误导性进度。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 从至少两个功能目录读取符合约定的 Markdown 票据，并以功能限定 ID 表达任务与跨功能依赖。
- [ ] 输出 `ready`、`in_progress`、`blocked`、`done` 的任务统计和 `done / total` 完成率，以及依赖均已完成的开发前沿。
- [ ] 验证缺少 frontmatter、无效状态、受阻任务缺少原因、重复 ID、缺失依赖、自依赖和循环依赖都会给出含票据路径的诊断。
- [ ] 使用 Node 内置测试覆盖正常图、空态、跨功能依赖、清单解析和全部诊断分支。
