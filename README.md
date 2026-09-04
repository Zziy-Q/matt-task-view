# Matt Dev View

**简体中文** | [English](README.en.md)

Matt Pocock Skills 负责规划与实施，Matt Dev View 负责只读展示开发过程。

[![CI](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml/badge.svg)](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[版本 v0.2.1](https://github.com/Zziy-Q/matt-task-view/releases/tag/v0.2.1)

读取项目内的 Markdown 规格、工单和架构记录，在 Codex 右侧面板或浏览器中回答：**现在到哪一步、下一张工单是什么、哪些验收还需核对。** 本机只读，零第三方运行依赖，无需账号、数据库或前端构建。

![SDD 概览：下一步、工单进度与五阶段入口](docs/images/SDD开发工单概览.png)

实际运行的网页截图，不含 Codex 应用外框。示例中 4 张工单已标记完成，16 条验收清单仍未勾选；工单完成、验收确认和交付分别跟踪。[查看全部界面与操作说明](docs/界面导览.md)。

## 快速运行

使用 Node.js 24；已在 macOS、Node.js `v24.13.1` 本地验证。其他平台的测试结果以 [CI 运行记录](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml)为准。

```sh
git clone https://github.com/Zziy-Q/matt-task-view.git
cd matt-task-view
node src/cli.mjs serve --port 0
```

打开终端输出的 `开发任务视图: http://127.0.0.1:<端口>/`，即可查看仓库自身的真实规格与工单。不需要 `npm install`；`--port 0` 自动选择空闲端口，按 `Ctrl+C` 关闭服务。

### 查看自己的项目

服务读取**启动命令的当前工作目录**。替换工具位置，然后从目标项目运行：

```sh
cd /path/to/your-project
mkdir -p .scratch
node /path/to/matt-task-view/src/cli.mjs serve --port 0
```

已有符合[票据契约](skills/matt-task-view/references/ticket-contract.md)的 Markdown 就能使用；没有票据时显示空任务视图；稍后创建 `.scratch/` 或基线目录也会被自动发现。服务不会自行规划、创建工单或执行开发。

## 接入 Codex / Matt 工作流

完整开发流程需搭配 [Matt Pocock Skills](https://github.com/mattpocock/skills)。这是独立的 companion skill 与本地服务，尚非 Codex 插件市场中的一键安装包。

| 部分 | 职责 |
| --- | --- |
| Matt Pocock Skills | 通过 `ask-matt` 路由，完成规格、`to-tickets` 拆票、`implement` 实施与评审 |
| 本仓库 companion skill | 约定本地票据、架构记录，以及何时打开 Codex 右侧视图 |
| Matt Dev View 网页服务 | 只读解析文件，显示阶段、依赖、诊断和验收记录 |

**Skills 是完整工作流的配套前提，不是网页服务的运行时依赖。** 克隆本仓库不会自动安装上游 Skills。架构门禁、票据 frontmatter 和自动打开侧栏属于本项目的适配约定。

1. 按[上游安装说明](https://github.com/mattpocock/skills#installation-30-second-setup)安装 Skills，选择 Codex，包含 `setup-matt-pocock-skills` 和所需的开发技能：

   ```sh
   npx skills@latest add mattpocock/skills
   ```

2. 在目标项目运行 `setup-matt-pocock-skills`，选择**本地 Markdown** tracker：规格为 `.scratch/<feature>/spec.md`，工单为 `.scratch/<feature>/issues/`。当前不读取 GitHub / Linear 等远端工单。

3. 回到本工具仓库，在 macOS / Linux 的终端中复制完整 companion 目录，并注册短命令：

   ```sh
   cd /path/to/matt-task-view
   mkdir -p "$HOME/.agents/skills"
   matt_skill_dir="$HOME/.agents/skills/matt-task-view"
   if mkdir "$matt_skill_dir"; then
     cp -R skills/matt-task-view/. "$matt_skill_dir/"
   else
     echo "技能目录已存在或不可写，请检查后手动更新；本次未覆盖。"
   fi
   npm link
   ```

   `~/.agents/skills/` 是本项目在 Codex 中使用的用户级技能路径；自定义安装环境请使用 Codex 实际加载的目录。已有技能会保留，升级时先比较本地修改；目录中的 `references/` 也必须完整复制。`npm link` 仅注册本地命令，不会发布 npm 包。若不使用它，在项目说明中写明 `node /实际路径/matt-task-view/src/cli.mjs` 作为命令前缀。

4. 将以下衔接约定加入目标项目的 `AGENTS.md`：

   ```markdown
   开发任务先通过 ask-matt 选择对应流程。
   正式规格完成后、to-tickets 前，读取 matt-task-view companion skill，
   按其 references/architecture-contract.md 完成架构影响判断，
   并使用 references/ticket-contract.md 生成本地票据。
   to-tickets 写完后、首次 implement 前，启动或复用当前项目的任务视图，
   并在同一回合打开到 Codex 右侧面板。
   ```

接入验收：从目标项目运行 `matt-task-view serve --port 0`，确认工单和源文件路径属于该项目；再对 Codex 说“启动开发任务视图”，确认右侧打开同一项目。若技能尚未被识别，重新开启 Codex 会话。

## 本地开发流程

固定顺序是：完成正式规格 → 记录架构影响，需要架构时通过门禁 → `to-tickets` 发布票据 → 首次 implement。`greenfield` 从规划架构 v0 开始；`existing` 先恢复或固定已验证的当前基线。无架构影响也必须记录非空跳过理由。

当 `required=true` 时，任务全部完成后生成 `actual` 实际架构并复核差异；用户显式批准后，才由外部流程把实际四件套精确提升为长期基线。`required=false` 只记录非空跳过理由，不生成架构图、回执或批准记录。任务视图只读展示，不批准或复制架构资产。命令、完整 JSON 模板和批准摘要规则见[架构契约](skills/matt-task-view/references/architecture-contract.md)。

## 功能说明

| 功能 | 当前行为 |
| --- | --- |
| 下一步与 SDD 阶段 | 先给出当前行动，再进入规格、架构、任务计划、实施、验证与交付 |
| 工单列表 / 依赖图 | 同一批实际开发工单切换查看；Archify 横向图可收起、展开大图，图下索引打开工单详情 |
| 可执行前沿 | `ready` 且依赖完成的工单才可开始；需要架构时还必须具备有效绑定，诊断失败时停止给出前沿 |
| 筛选与详情 | 按功能、状态筛选，核对依赖、验收清单和 Markdown 来源；选择状态保存在 URL |
| 架构追溯 | 仅从 SDD 架构入口查看当前、目标、实际与长期基线，以及批准修订和组件定位 |
| 验收与交付 | `[ ]` 未勾选、`[~]` 已实现待验收、`[x]` 已验收；工单 `done` 不等于已交付 |
| 诊断与实时刷新 | 检查缺失字段、状态和依赖问题；监听 `.scratch/` 与 `docs/architecture/`，通过 SSE 更新页面 |
| 本机只读 | 仅监听 `127.0.0.1`，只接受 GET；无账号、OAuth、JWT、Session 或 API Token |

[界面导览与全部截图](docs/界面导览.md) · [认证、组件与请求流程](docs/认证与请求流程.md)

## 数据目录和最小票据

```text
your-project/
├── .scratch/
│   └── feature-name/
│       ├── spec.md
│       ├── issues/01-first-task.md
│       └── architecture/decision.json
└── docs/architecture/              # 用户批准后提升的长期基线
```

例如只修改说明文档，在 `.scratch/feature-name/architecture/decision.json` 中保存完整决定（`schemaVersion`、`mode` 也必填）：

```json
{
  "schemaVersion": 1,
  "required": false,
  "mode": "existing",
  "reason": "仅完善使用说明，不改变组件、接口、数据流或部署结构。"
}
```

然后在 `.scratch/feature-name/issues/01-first-task.md` 写入：

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

`depends_on` 的非空列表使用多行形式，例如 `depends_on:` 下一行缩进写 `- "01"`；跨功能引用写 `- "other-feature/01"`。解析器支持约定的 frontmatter 子集，并非通用 YAML。完整规则见[票据契约](skills/matt-task-view/references/ticket-contract.md)。

架构参考目录可在 `spec.md` 首个二级标题前写 `**View:** architecture`；该功能的规格与工单不进入开发区域，架构仍在 SDD 的“架构设计”展示。源文件与后端校验保留，不按目录名称猜测类型。

## 验证与项目结构

```sh
npm test
```

使用 Node.js 内置测试运行器，覆盖任务图、架构门禁及生命周期、Archify、HTTP、文件监听与前端行为。最新运行结果见 [CI](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml)。

| 路径 | 职责 |
| --- | --- |
| `src/cli.mjs`、`src/server.mjs` | 启动、本机只读 HTTP、文件监听与 SSE |
| `src/task-graph.mjs` | 票据、依赖前沿、架构校验 |
| `src/workflow.mjs`、`vendor/archify/` | 调用固定版本 Archify 生成并校验依赖图 |
| `src/public/`、`test/` | 原生网页与自动测试 |
| `skills/`、`docs/agents/` | 配套技能和本地开发契约 |
| `.scratch/`、`docs/architecture/` | 本项目真实开发记录与架构事实 |

## 当前边界

- 不提供网页编辑、拖拽改状态、远端工单同步、云端协作或 Agent 执行。
- 验证页汇总本地验收清单，不自动导入测试、CI 或发布回执；没有数据时显示“快照未提供”。
- 适用于可信本机环境。没有身份认证、Host/Origin 白名单、DNS rebinding 专项防护或多租户隔离，不适合直接暴露到公网或共享代理。
- `package.json` 设置 `private: true`，通过 Git 克隆使用，没有发布 npm 包。

## 许可与来源

本项目采用 [MIT 许可证](LICENSE)。Matt Pocock Skills 是独立上游，不随本仓库安装；[Archify](https://github.com/tt-a1i/archify) 的固定运行文件、MIT 许可证及第三方说明保留在 [vendor/archify](vendor/archify/UPSTREAM.md)。
