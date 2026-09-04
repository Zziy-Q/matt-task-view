# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- 发布顺序固定为 `spec.md` → `architecture/` 架构门禁 → `issues/`；门禁未通过时不得创建或发布 `issues/` 票据
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

先读取 `skills/matt-task-view/references/ticket-contract.md` 和 `.scratch/<feature-slug>/architecture/decision.json`，再原子判断整组票据能否发布。完整决定字段、内置 Archify 命令与批准规则见 `skills/matt-task-view/references/architecture-contract.md`：

- `required=false` 只在中文跳过理由非空时通过。
- `required=true` 只在 JSON、HTML、回执齐全，当前摘要与回执、用户批准摘要都精确匹配时通过；`existing` 还必须固定已验证的项目当前基线。
- 任一条件失败就停在创建 `issues/` 之前，不发布部分票据。

门禁通过后，在 `.scratch/<feature-slug>/issues/` 按一票一文件发布。需要架构的票据填写 `architecture_revision` 和 `affects`；`depends_on` 只表达任务执行依赖。不要把多张票据合并成单文件。

`to-tickets` 完成后、首次 implement（`/implement`）前，必须自动启动或复用同一仓库的 `127.0.0.1` 任务视图服务，并在同一回合调用 `open_in_codex` 以 `right` 位置打开；不等待用户重复请求。

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
