# Matt Task View

本地 Markdown 票据的只读 SDD 开发工作台：读取 `.scratch/<feature>/issues/`，在 `127.0.0.1` 展示下一步、实际开发工单、任务依赖与验收记录。

适合在 Codex 右侧面板或普通浏览器中跟踪本地开发。规格、票据和架构文件保存在项目内，视图负责读取与解释这些事实。主服务使用 Node.js 标准库和原生 HTML/CSS/JavaScript；任务依赖图由仓库内固定版本的 Archify 生成，无需安装依赖、数据库或前端构建步骤。

**本地 Markdown · 下一步提示 · 列表 / 依赖图切换 · 架构版本追溯 · 中文界面**

![SDD 概览：下一步、工单进度与五阶段入口](docs/images/SDD开发工单概览.png)

> 实际运行截图：4 张开发工单已标记完成，16 条验收清单仍未勾选。两类记录分别展示；清单未勾选不等于代码尚未实现，工单完成也不等于已经交付。

[界面导览](docs/界面导览.md) · [快速运行](#快速运行) · [功能清单](#功能说明) · [认证与请求流程](docs/认证与请求流程.md)

## 本地开发流程

固定顺序是：完成正式规格 → 判断架构影响并通过门禁 → `to-tickets` 发布票据 → 首次 implement。`greenfield` 从规划架构 v0 开始；`existing` 先恢复或固定已验证的当前基线。无架构影响也必须记录非空跳过理由。

任务全部完成后生成 `actual` 实际架构并复核差异；用户显式批准后，才由外部流程把实际四件套精确提升为长期基线。任务视图只读展示整个过程，不批准或复制架构资产。完整字段契约见 companion skill 与票据契约文档。

```sh
matt-task-view serve --port 0
```

在 Codex 中，由 `matt-task-view` companion skill 在 `to-tickets` 后、首次 `implement` 前自动启动或复用服务，并在同一回合将输出地址打开到右侧浏览器面板。

## 界面展示

### 先看下一步，再进入具体工作

工作台分为“SDD 概览”和“开发工单”。概览优先展示当前行动建议、工单完成数、进行中数量及待核对的验收项；五个阶段作为进入规格、架构、任务与验证的入口。

### 同一批工单，两种查看方式

每次选择一个实际开发功能，在列表和依赖图之间切换。列表支持状态筛选；依赖图统一使用 Archify 的彩色节点与分层连线，功能分组可收起、展开，也可打开大图。通过列表行或图下任务索引进入同一份右侧工单详情，查看前置依赖、验收项和源文件位置。

![开发工单列表](docs/images/开发工单列表.png)

![Archify 实际开发依赖图与工单索引](docs/images/实际开发依赖与工单.png)

![共享工单详情：依赖、验收记录与 Markdown 来源](docs/images/任务详情.png)

### 架构只从 SDD 的架构设计进入

“架构设计门禁与中文架构阶段卡片”是架构参考资料，只在 SDD 的“架构设计”入口中展示。规格、开发进度、列表和依赖图只包含实际开发工单。架构页保留当前、目标、实际与长期基线，以及实际复核、修订绑定和组件定位。

![SDD 架构设计：生命周期与受限架构预览](docs/images/SDD架构设计.png)

### 完成之后，核对验收与交付

“验证与交付”汇总已确认的验收项，并可进入每张工单核对原始清单。测试与评审、界面验证、发布回读没有数据时明确显示“快照未提供”；页面不会据此编造执行记录或把工单完成推断为已上线。

![验证与交付：验收清单和交付证据分别记录](docs/images/SDD验收与交付.png)

以上是 Codex 内嵌浏览器的网页截图，不含 Codex 应用外框。更多截图与逐项解读见 [界面导览](docs/界面导览.md)。

## 功能说明

| 功能 | 当前行为 |
| --- | --- |
| 下一步与进度 | 按当前功能展示已完成 / 总工单、进行中工单和待核对验收项；根据诊断、开发条件与任务状态给出下一步 |
| SDD 流程 | 五个阶段：规格与边界、架构设计、任务计划、开发实施、验证与交付；概览显示摘要，点击进入对应内容 |
| 列表 / 依赖图 | 同一批实际开发工单切换显示；依赖图统一使用 Archify 沙箱图，功能分组可收起、展开，图下任务索引可打开详情，也可展开完整图 |
| 可执行前沿 | 只列出依赖已完成、架构门禁和绑定有效的 `ready` 任务；计划诊断失败时停止给出前沿 |
| 任务筛选与详情 | 选择一个功能，列表内按状态筛选；列表和图共用工单详情，展示前置依赖、验收项及 Markdown 来源 |
| 验收三态 | `[ ]` 未勾选、`[~]` 已实现待验收、`[x]` 已验收；保留原始标记，独立于工单状态统计 |
| 计划诊断 | 检查缺失字段、非法状态、重复 ID、缺失依赖、自依赖和循环依赖，并显示诊断 |
| 架构追溯 | 在 SDD 架构页核对 `architecture_revision`、`affects` 与批准修订及稳定组件 ID，提供有效组件定位链接 |
| 架构生命周期 | 区分规划、实际复核、交付校验、用户批准与长期基线；识别过期批准和被修改的产物 |
| 架构预览 | 经校验的 HTML 在受限 iframe 中展示，也可展开大图；过期规划可以保留上次有效预览，但不能据此开始新任务 |
| 验证与交付 | 汇总验收项并逐张核对工单；没有导入的交付证据明确标记为“快照未提供” |
| 实时刷新 | 监听 `.scratch/` 文件变化，以 SSE 通知浏览器重新读取快照；当前视图、筛选与所选工单可通过 URL 保留 |
| 本机只读 | 仅监听 `127.0.0.1`，HTTP 只接受 GET，不修改票据或代替用户批准 |

## 快速运行

已在 macOS、Node.js `v24.13.1` 验证。建议使用 Node.js 24；其他系统与版本尚未在本次发布中验证。

```sh
git clone https://github.com/951655087/matt-task-view.git
cd matt-task-view
node src/cli.mjs serve --port 0
```

打开终端输出的 `开发任务视图: http://127.0.0.1:<端口>/`。`--port 0` 自动分配空闲端口；需要固定端口时可传入 `--port 4317`。按 `Ctrl+C` 关闭本次服务。直接运行不需要 `npm install`。

仓库保留自身开发规格、票据及架构记录，可直接查看真实项目状态。架构卡片按当前文件校验结果展示，不保证所有历史阶段都显示为已批准。

### 查看其他项目

服务以**启动命令的当前工作目录**作为读取根目录。将下面路径替换为你克隆的工具位置：

```sh
cd /path/to/your-project
mkdir -p .scratch
node /path/to/matt-task-view/src/cli.mjs serve --port 0
```

`.scratch/` 必须存在，才能建立文件监听；空目录会显示空任务视图。需要短命令时，可在工具仓库内自行执行 `npm link`，之后从目标项目运行 `matt-task-view serve --port 0`。

### 接入 Codex / Matt 工作流

将仓库中的 [companion skill](skills/matt-task-view/SKILL.md) 及其 `references/` 一起放入你的技能目录，并让 `matt-task-view` 命令可用。该 skill 约定在发布本地票据后自动打开 Codex 右侧视图，也支持“启动开发任务视图”。复制技能是单独的本机配置步骤，克隆本仓库不会自动安装技能。

## 数据目录和票据格式

```text
your-project/
├── .scratch/
│   └── feature-name/
│       ├── spec.md
│       ├── issues/
│       │   ├── 01-first-task.md
│       │   └── 02-next-task.md
│       └── architecture/
│           ├── decision.json
│           ├── system.architecture.json
│           ├── system.architecture.html
│           ├── system.architecture.receipt.json
│           └── actual/                 # 实施后的复核四件套
└── docs/architecture/                  # 经外部流程提升的长期基线
```

架构参考目录可在 `spec.md` 首个二级标题前显式写入 `**View:** architecture`。该标记只控制展示：规格和工单不进入开发区域，架构留在 SDD 的“架构设计”中。源票据与后端依赖、架构校验仍保留，不按目录名称猜测类型。

普通文档任务可在架构决定中记录 `required=false` 和非空跳过理由，省略票据的架构绑定字段。旧项目没有架构文件时保留兼容显示，但这不代表已通过新工作流要求的显式判断。

最小票据示例：

```markdown
---
id: "01"
status: ready
depends_on: []
blocked_reason: ""
phase: "文档"
---
# 01: 完善使用说明

**Status:** ready-for-agent

## 验收
- [ ] 已写明启动方法
- [~] 已补充示例，等待验收
- [x] 已确认读取根目录的规则
```

`depends_on` 的非空列表使用多行形式，例如 `depends_on:` 下一行缩进写 `- "01"`；跨功能引用写 `- "other-feature/01"`。解析器只支持本项目约定的 frontmatter 子集，并非通用 YAML 解析器。完整字段见 [票据契约](skills/matt-task-view/references/ticket-contract.md)。

## 组件、请求流程与认证

```mermaid
flowchart LR
    CLI[CLI：当前目录与端口] --> HTTP[本机 HTTP 服务]
    Browser[浏览器 / Codex 面板] -->|GET /api/snapshot| HTTP
    HTTP --> Graph[任务图与架构校验]
    Graph --> Files[本地规格、票据、架构四件套]
    Files -->|.scratch 文件变化| Watch[文件监听]
    Watch -->|SSE refresh| Browser
    HTTP -->|受限 HTML| Frame[沙箱架构预览]
    Graph --> Workflow[Archify workflow v2]
    Workflow -->|校验后 HTML| Frame
```

本项目**没有账号登录、OAuth、JWT、Session 或 API Token**，也不读取 GitHub 凭据。`127.0.0.1` 限制、只读路由、产物完整性校验与浏览器沙箱构成当前访问边界。SHA-256 是一致性检查，不是登录凭证或用户身份签名。详见 [认证与请求流程](docs/认证与请求流程.md)，包含代码定位、各接口行为及凭据处理说明。

## 验证与项目结构

```sh
npm test
```

使用 Node.js 内置测试运行器；本次发布通过 91 项测试，覆盖任务图、Archify 适配与交付、架构门禁、生命周期、渲染、HTTP 路由、路径拒绝和 SSE。

| 路径 | 职责 |
| --- | --- |
| `src/cli.mjs` | 命令参数、读取根目录、服务启动和退出 |
| `src/server.mjs` | 只读 HTTP、静态资源、架构与工作流路由、文件监听和 SSE |
| `src/workflow.mjs` | 将当前功能的任务 DAG 转为 Archify workflow v2，并验证交付回执 |
| `src/task-graph.mjs` | 票据解析、依赖校验、开发前沿及架构校验 |
| `src/public/` | 原生浏览器界面、响应式样式与交互 |
| `test/` | 无第三方框架的自动测试 |
| `skills/`、`docs/agents/` | Matt companion、票据契约和本地开发约定 |
| `.scratch/`、`docs/architecture/` | 本项目开发记录及架构事实来源 |
| `prototype/architecture-card/` | 历史布局探索；运行 `npm run prototype:architecture`，与正式任务服务分离 |
| `vendor/archify/` | 固定提交的 MIT Archify 运行文件、许可证与来源说明 |

## 当前边界

- 不提供网页编辑、拖拽改状态、用户权限管理或云端协作。
- 不同步 GitHub/GitLab Issues，不调用远端 API；推送代码到 GitHub 不会自动增加这些能力。
- “验证与交付”目前汇总本地工单的验收清单，不会自动导入测试、CI 或发布回执。全部任务 `done` 也不会自动变成“已交付”。
- 文件监听范围是 `.scratch/`；只修改 `docs/architecture/` 后需手动刷新页面重新读取。
- 服务每次重新构建快照，适用于本地项目；没有数据库、持久缓存或多租户隔离。
- 当前无身份认证、Host/Origin 白名单或 DNS rebinding 专项防护，不适合直接暴露到公网或共享代理。
- `package.json` 设置 `private: true`，当前通过 Git 克隆使用，没有发布 npm 包。

## 参考

- [Archify](https://github.com/tt-a1i/archify)——任务依赖图固定使用 `06dd052602dd9a369e4d034e24faef0917b5a60c` 的 workflow v2 运行文件，来源和许可证随仓库保留。
- [GitHub：将本地代码加入 GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)——本仓库采用已有本地代码的首次推送流程。
