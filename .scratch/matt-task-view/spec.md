# Matt Dev View

**Status:** ready-for-agent

## Problem Statement

Matt Pocock Skills 会先把一个功能拆成可执行的本地 Markdown 票据，但在 Codex 中，用户需要逐个打开文件才能知道整个仓库有哪些功能、哪些任务可以开始、哪些任务受阻，以及完成了多少。进入 `implement` 前缺少一个始终可见、与票据源同步的开发进度视图。

## Solution

提供一个零依赖的本地命令行工具和一个随工具分发的 Matt companion skill。工具只读取当前仓库 `.scratch/<feature>/issues/` 下的本地票据，构建经校验的任务图快照，并在仅绑定 `127.0.0.1` 的 HTTP 页面中展示：全仓库完成率、功能和阶段分组、任务依赖图、可开始/进行中/受阻任务以及可折叠的票据列表。

该 companion skill 在 `to-tickets` 成功后、第一次 `implement` 前启动或复用本地服务，并通过 Codex 的右侧浏览器面板打开页面。文件变化会通过 Server-Sent Events 推送，使页面自动刷新。页面只读；任务真实状态仍由票据文件维护。

## User Stories

1. As a Codex 用户, I want to 在开发开始前看到仓库的全部功能任务图, so that 我能确认计划没有遗漏。
2. As a Codex 用户, I want to 在右侧面板查看任务图, so that 我能在对话与实现之间保持可见的进度上下文。
3. As a Codex 用户, I want to 看到已完成任务数、任务总数和完成率, so that 我能判断项目当前进度。
4. As a Codex 用户, I want to 看到可开始、进行中和受阻任务的数量, so that 我能优先处理真正位于开发前沿的工作。
5. As a Codex 用户, I want to 按功能查看任务, so that 多个 `.scratch/<feature>/` 计划不会混成一张无法理解的图。
6. As a Codex 用户, I want to 按可选阶段查看同一功能内的任务, so that 我能理解一段工作在流程中的位置。
7. As a Codex 用户, I want to 看到依赖箭头从前置任务指向后续任务, so that 我能知道为什么一个任务尚不能开始。
8. As a Codex 用户, I want to 从图节点看到任务标题、状态和受阻原因, so that 我无需离开侧栏即可判断下一步。
9. As a Codex 用户, I want to 展开原生任务列表查看验收条件, so that 我能快速核对当前计划的具体交付物。
10. As a Codex 用户, I want to 点击任务后得到其本地票据路径, so that 我或 Codex 可以打开同一份事实来源。
11. As a Codex 用户, I want to 修改本地票据后页面自动更新, so that 进度不会停留在过期快照。
12. As a Codex 用户, I want to 在某个依赖 ID 缺失、重复或成环时看到明确错误, so that 我能先修正计划而不是基于错误的图开发。
13. As a Codex 用户, I want to 在没有 YAML frontmatter 的旧格式票据出现时看到迁移提示, so that 旧计划不会被静默错误解读。
14. As a Codex 用户, I want to 让初次生成的新票据自带视图所需元数据, so that `to-tickets` 与进度视图直接联动。
15. As a Codex 用户, I want to 只在本机回环地址访问该页面, so that 本地项目计划和路径不会暴露到局域网或远程服务。
16. As a Codex 用户, I want to 不配置 GitHub、GitLab 令牌也能使用首发版本, so that 这个能力可以立即用于当前的本地 Matt 工作流。
17. As a Codex 用户, I want to 保持页面只读, so that 我不会在图上误改任务，导致 Markdown 事实来源与图不同步。
18. As a Codex 用户, I want to 只使用已安装的 Node 运行时, so that 工具安装、维护和审计成本保持很低。
19. As a Codex 用户, I want to 在新仓库中按同一命令和 companion skill 使用该视图, so that 这项能力成为全局 Matt 工作流的一部分。
20. As a Codex 用户, I want to 即使某些票据暂时无依赖也能清楚识别, so that 我能并行安排真正独立的工作。

## Implementation Decisions

- 工具是独立的 `matt-task-view` companion，而不是修改已复制到全局目录的 Matt Pocock 上游技能；上游升级不会覆盖本项目代码。
- 首发数据源只扫描当前工作目录 `.scratch/<feature>/issues/`。功能由 `<feature>` 目录名标识；不读取 GitLab、GitHub、Linear 或远程 API。
- 每个可视化票据使用 YAML frontmatter：`id`、`status`、`depends_on`、`blocked_reason`；可选 `phase`。`status` 只允许 `ready`、`in_progress`、`blocked`、`done`。现有 Markdown 正文和 `**Status:** ready-for-agent` 保留为 Matt 的 triage 语义，不与视图状态混用。
- 同功能依赖可简写为本功能 ID；跨功能依赖使用 `feature/id`。图节点使用功能限定 ID，避免多个功能都存在 `01` 时冲突。
- 快照构建器是唯一业务入口：递归读取本地票据、解析元数据与正文、解析验收清单、校验 ID 和依赖、检测循环、推导可开始任务、统计进度，并返回页面与 API 共用的 JSON 快照。
- 票据缺少所需元数据、状态值无效、依赖不存在、自依赖或依赖循环都被视为计划错误。页面显示错误及相关票据路径，不会伪造一个看似可信的 DAG。
- `blocked_reason` 在 `blocked` 状态下必须有可读内容；其他状态可以为空。
- 完成率固定为 `done` 任务数除以全部任务数；不引入工时、权重、ETA 或“看起来完成”的启发式统计。
- HTTP 服务只绑定 `127.0.0.1`。页面、快照 API 和 SSE 均来自同一进程；不使用 CDN、外部分析、Cookie、鉴权令牌或远程上传。
- 监听票据目录变化并对 SSE 客户端广播刷新事件。客户端收到事件后重新请求快照，渲染结果始终由服务端快照决定。
- 前端使用原生 HTML、CSS、JavaScript 和 SVG 绘制 DAG；不添加图表库或前端框架。任务摘要、阶段/功能筛选、依赖线、状态色与原生 `<details>` 列表均从快照渲染。
- 页面将来自 Markdown 的文本与路径按 HTML/SVG 上下文转义；页面不执行票据内容。
- 右侧打开动作由 companion skill 调用 Codex 浏览器面板完成；CLI 本身只负责服务，不假设或伪造永久原生侧边栏 API。
- companion skill 指示 `to-tickets` 为新票据写入该 frontmatter，并在首次 `implement` 前启动/复用视图。它不会替代或修改 Matt 的 `to-tickets`、`implement`、TDD 或代码评审技能。
- 工具默认使用仓库根目录作为扫描基准，并要求显式功能参数或自动发现现有功能目录；没有任何票据时返回空态而不是崩溃。

## Testing Decisions

- 测试只验证用户可观察行为和公开快照契约，而不是内部函数调用顺序。
- 使用 Node 内置 `node:test` 与临时测试目录，不添加测试框架或生产依赖。
- 最高层测试缝是“票据目录输入到任务图快照输出”：覆盖正常多功能依赖图、完成率、开发前沿、阶段分组、Markdown 验收项、无任务空态，以及所有计划错误。
- HTTP 集成测试验证页面可加载、快照 API 返回同一快照、SSE 在票据变化后通知客户端，且监听地址为回环地址。
- 前端渲染测试验证用户能看到摘要、任务节点、依赖、受阻原因、空态和校验错误；HTML/SVG 输出不能插入未转义的票据文本。
- 以一个真实格式的 `to-tickets` 票据样本作为兼容性样例，确保增强 frontmatter 不破坏现有标题、`Blocked by`、`Status` 与 checklist 约定。

## Out of Scope

- GitLab、GitHub、Linear、Jira 或其他远程任务源与鉴权。
- 在图中拖拽、编辑、关闭或重新排序任务。
- 永久注入 Codex 原生 UI、修改 Codex 客户端、后台常驻守护进程或跨任务共享进程管理。
- 任务工时、燃尽图、预测 ETA、人员分配、通知或自动执行任务。
- 自动修复损坏票据、自动推送、提交、建分支或创建 PR。
- 替换 Matt Pocock 的开发流程或引入 Superpowers 流程。

## Further Notes

- 用户界面名称使用“Matt Dev View”，中文副标题使用“SDD 开发视图”；工具和 companion skill 名称保持 `matt-task-view`。
- 可视化是票据的派生读模型；票据文件始终是唯一事实来源。
- 首发版本应优先保持一个进程、一个输入目录约定、一个 JSON 快照契约。未来接入 GitLab/GitHub 时新增 adapter，不改变图与 UI 的消费契约。
