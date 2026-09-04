# Matt Dev View

[简体中文](README.md) | **English**

Matt Pocock Skills plans and implements the work. Matt Dev View provides a read-only view of the development process.

[![CI](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml/badge.svg)](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[Release v0.2.1](https://github.com/Zziy-Q/matt-task-view/releases/tag/v0.2.1)

It reads Markdown specifications, tickets, and architecture records from a project and answers three questions in the Codex right panel or a browser: **Where is the project now? Which ticket is next? Which acceptance items still need review?** It runs locally, writes nothing to the project, has no third-party runtime dependencies, and requires no account, database, or frontend build.

![SDD overview showing the next action, ticket progress, and five development stages](docs/images/SDD开发工单概览.png)

This is a screenshot of the running web interface without the Codex application frame. The example has four completed tickets and sixteen unchecked acceptance items. Ticket completion, acceptance confirmation, and delivery are tracked separately. [See every view and the interaction guide](docs/interface-guide.en.md).

## Quick start

Use Node.js 24. The project has been verified locally on macOS with Node.js `v24.13.1`; see [GitHub Actions](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml) for results on other tested platforms.

```sh
git clone https://github.com/Zziy-Q/matt-task-view.git
cd matt-task-view
node src/cli.mjs serve --port 0
```

Open the local URL printed after `开发任务视图:`. The page will show this repository's real specification and tickets. You do not need to run `npm install`; `--port 0` selects an available port, and `Ctrl+C` stops the service.

### View your own project

The service reads the **current working directory from which the command is launched**. Replace the tool path below, then run it from the project you want to inspect:

```sh
cd /path/to/your-project
mkdir -p .scratch
node /path/to/matt-task-view/src/cli.mjs serve --port 0
```

Any Markdown that follows the [ticket contract](skills/matt-task-view/references/ticket-contract.md) appears automatically. With no tickets, the service shows an empty task view. It also discovers `.scratch/` and baseline directories created after startup. The service never plans work, creates tickets, or runs development tasks.

## Connect it to Codex and the Matt workflow

The complete development workflow uses [Matt Pocock Skills](https://github.com/mattpocock/skills). This repository supplies a separate companion skill and local service; it is not currently a one-click Codex plugin marketplace package.

| Part | Responsibility |
| --- | --- |
| Matt Pocock Skills | Route work through `ask-matt`, write the specification, split it with `to-tickets`, implement it with `implement`, and review the result |
| This repository's companion skill | Define the local ticket and architecture-record contracts and when to open the Codex right panel |
| Matt Dev View web service | Parse files without modifying them and show stages, dependencies, diagnostics, and acceptance records |

**The Skills are a prerequisite for the full workflow, not a runtime dependency of the web service.** Cloning this repository does not install the upstream Skills. The architecture gate, ticket frontmatter, and automatic opening of the right panel are conventions supplied by this project.

1. Follow the [upstream installation guide](https://github.com/mattpocock/skills#installation-30-second-setup), select Codex, and install `setup-matt-pocock-skills` plus the development skills you need:

   ```sh
   npx skills@latest add mattpocock/skills
   ```

2. Run `setup-matt-pocock-skills` in the target project and choose the **local Markdown** tracker. Specifications live at `.scratch/<feature>/spec.md`, and tickets live at `.scratch/<feature>/issues/`. Matt Dev View does not currently read remote GitHub or Linear tickets.

3. Return to this repository and copy the complete companion directory from a macOS or Linux terminal. Then register the short command:

   ```sh
   cd /path/to/matt-task-view
   mkdir -p "$HOME/.agents/skills"
   matt_skill_dir="$HOME/.agents/skills/matt-task-view"
   if mkdir "$matt_skill_dir"; then
     cp -R skills/matt-task-view/. "$matt_skill_dir/"
   else
     echo "The skill directory already exists or is not writable. Check it and update it manually; nothing was overwritten."
   fi
   npm link
   ```

   This project uses `~/.agents/skills/` as the user-level Codex skill directory. If your installation differs, use the directory that Codex actually loads. The command preserves an existing skill; compare local changes before upgrading. Copy `references/` with the rest of the directory. `npm link` only registers a local command and does not publish an npm package. If you do not use it, put `node /absolute/path/to/matt-task-view/src/cli.mjs` in the project instructions as the command prefix.

4. Add this handoff contract to the target project's `AGENTS.md`:

   ```markdown
   Route development tasks through ask-matt first.
   After the formal specification and before to-tickets, read the matt-task-view companion skill,
   use references/architecture-contract.md to decide whether the work affects architecture,
   and use references/ticket-contract.md to create local tickets.
   After to-tickets and before the first implement run, start or reuse the project's task view
   and open it in the Codex right panel during the same turn.
   ```

To verify the integration, run `matt-task-view serve --port 0` from the target project and confirm that the listed tickets and source paths belong to that project. Then tell Codex “启动开发任务视图” and confirm that the same project opens in the right panel. If Codex has not discovered the new skill, start a new Codex session.

## Local development workflow

The fixed order is: finish the formal specification → record the architecture impact and, when architecture is required, pass the gate → publish tickets with `to-tickets` → run the first `implement`. A `greenfield` project begins with planned architecture v0. An `existing` project first restores or pins a verified current baseline. Work with no architecture impact still records a non-empty reason for skipping the architecture artifacts.

When `required=true`, the external workflow generates the `actual` architecture after every ticket is complete and reviews its differences. Only explicit user approval may promote the exact set of actual artifacts to the long-term baseline. With `required=false`, the decision records a non-empty reason and creates no architecture diagram, receipt, or approval record. Matt Dev View displays these records without approving or copying architecture assets. See the [architecture contract](skills/matt-task-view/references/architecture-contract.md) for commands, complete JSON templates, and approval-summary rules.

## Features

| Feature | Current behavior |
| --- | --- |
| Next action and SDD stages | Shows the current action first, followed by specification, architecture, task planning, implementation, verification, and delivery |
| Ticket list and dependency graph | Switches between two views of the same development tickets; the horizontal Archify graph can collapse or open full-size, and its index opens ticket details |
| Executable frontier | A ticket may start only when it is `ready` and all dependencies are complete; when architecture is required, its binding must also be valid; diagnostics stop frontier calculation on invalid input |
| Filters and details | Filters by feature and status and shows dependencies, acceptance items, and Markdown sources; the URL stores the selected state |
| Architecture traceability | Shows current, target, actual, and long-term baselines only within the SDD architecture section, together with approved revisions and component locations |
| Acceptance and delivery | `[ ]` unchecked, `[~]` implemented but awaiting acceptance, `[x]` accepted; a `done` ticket is not the same as a delivered result |
| Diagnostics and live updates | Checks missing fields, states, and dependencies; watches `.scratch/` and `docs/architecture/` and refreshes the page through SSE |
| Local and read-only | Listens only on `127.0.0.1` and accepts only GET requests; there are no accounts, OAuth flows, JWTs, sessions, or API tokens |

[Interface guide and screenshots](docs/interface-guide.en.md) · [Authentication, components, and request flow](docs/authentication-and-request-flow.en.md)

## Data layout and minimal ticket

```text
your-project/
├── .scratch/
│   └── feature-name/
│       ├── spec.md
│       ├── issues/01-first-task.md
│       └── architecture/decision.json
└── docs/architecture/              # Long-term baseline promoted after user approval
```

For a documentation-only change, store a complete decision in `.scratch/feature-name/architecture/decision.json`. `schemaVersion` and `mode` are required:

```json
{
  "schemaVersion": 1,
  "required": false,
  "mode": "existing",
  "reason": "This change only improves documentation and does not alter components, interfaces, data flow, or deployment structure."
}
```

Then create `.scratch/feature-name/issues/01-first-task.md`:

```markdown
---
id: "01"
status: ready
depends_on: []
blocked_reason: ""
phase: "Documentation"
---
# 01: Improve the usage guide

**Status:** ready-for-agent

## Acceptance
- [ ] Startup instructions are documented
- [~] The example is implemented and awaiting review
- [x] The project-root lookup rule is confirmed
```

Write non-empty `depends_on` lists on multiple lines, for example `depends_on:` followed by an indented `- "01"`. Cross-feature references use `- "other-feature/01"`. The parser implements the documented frontmatter subset rather than general YAML. See the [ticket contract](skills/matt-task-view/references/ticket-contract.md) for the complete rules.

An architecture-reference directory can put `**View:** architecture` before the first level-two heading in `spec.md`. Its specification and tickets stay out of the development area while its architecture remains available under the SDD “Architecture Design” stage. The source file and backend validation determine the behavior; the service does not guess from directory names.

## Validation and project structure

```sh
npm test
```

The project uses Node.js's built-in test runner to cover the task graph, architecture gates and lifecycle, Archify, HTTP, file watching, and frontend behavior. See the latest result in [CI](https://github.com/Zziy-Q/matt-task-view/actions/workflows/ci.yml).

| Path | Responsibility |
| --- | --- |
| `src/cli.mjs`, `src/server.mjs` | Startup, local read-only HTTP, file watching, and SSE |
| `src/task-graph.mjs` | Tickets, executable frontier, and architecture validation |
| `src/workflow.mjs`, `vendor/archify/` | Invoke the pinned Archify runtime to generate and validate dependency graphs |
| `src/public/`, `test/` | Native web interface and automated tests |
| `skills/`, `docs/agents/` | Companion skill and local-development contracts |
| `.scratch/`, `docs/architecture/` | This project's real development records and architecture facts |

## Current boundaries

- No browser editing, drag-to-change-status interaction, remote ticket synchronization, cloud collaboration, or agent execution.
- The verification page summarizes local acceptance checklists. It does not automatically import tests, CI results, or release receipts; when no such data exists, it displays “快照未提供” (snapshot not provided).
- Designed for a trusted local environment. It has no authentication, Host/Origin allowlist, dedicated DNS-rebinding protection, or multi-tenant isolation. Do not expose it directly to the public internet or a shared proxy.
- `package.json` sets `private: true`. Use the project through a Git clone; no npm package is published.

## License and attribution

This project is licensed under the [MIT License](LICENSE). Matt Pocock Skills is an independent upstream project and is not installed with this repository. The pinned [Archify](https://github.com/tt-a1i/archify) runtime, MIT license, and third-party notices are retained under [vendor/archify](vendor/archify/UPSTREAM.md).
