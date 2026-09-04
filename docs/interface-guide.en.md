# Matt Dev View · Interface Guide

[简体中文](界面导览.md) | **English**

The screenshots below come from the repository's actual task-view service and were captured on September 5, 2026. They show the web page inside Codex's embedded browser without the Codex application frame. The data comes from the project's existing Markdown tickets and architecture files; no execution, blocked, test-passed, or release state was fabricated for the screenshots.

The current example contains four actual development tickets, all marked `done`, while 16 acceptance checklist items remain unchecked. The page presents these two records separately so that ticket state is not mistaken for acceptance or delivery evidence.

## 01 / Know what comes next

![SDD overview](images/SDD开发工单概览.png)

The page has two entry points: “SDD 概览” (SDD Overview) and “开发工单” (Development Tickets). The overview presents the recommended next action first, followed by completed / total tickets, tickets in progress, and acceptance items that still need review.

The SDD process is split into five stages: specification and boundaries, architecture design, task planning, development implementation, and verification and delivery. Each row provides a summary and status and opens the corresponding content. In this example, the next action is to review the acceptance checklist and add verification records; completing `4 / 4` tickets does not make the page claim that delivery is complete.

When several actual development features exist, the feature selector chooses one at a time. The specification, progress, tickets, and acceptance statistics follow the selected feature, preventing ticket numbers such as `01` and `02` from different features from being mixed together.

## 02 / Review tickets in the list

![Development ticket list](images/开发工单列表.png)

Under “开发工单” (Development Tickets), the list and dependency graph are two views of the same tickets. Each row shows the ticket number, development work, phase, acceptance items that still need review, and task status. The list can be filtered by all, completed, in progress, ready to start, or blocked.

This project currently shows only the four actual development tickets for Matt Dev View. Architecture reference material is excluded from development tickets and completion counts; the source files and backend dependency and architecture validation remain in place.

## 03 / Read execution order in the dependency graph

![Actual development dependency graph](images/实际开发依赖与工单.png)

After switching to “依赖图” (Dependency Graph), Archify consistently renders colored task nodes and the actual layered connections. Arrows represent prerequisites; the four current tickets form `01 → 02 → 03 → 04`. Feature groups can be collapsed and expanded, and a narrow panel shows a compact overview of the graph.

The task index below the graph opens ticket details, while “展开大图” (Open Full Graph) opens the complete Archify artifact. Connections come from the task dependency fields, not from ticket-number ordering. Parallel and branching dependencies use the same renderer.

## 04 / Use the same details from the list and graph

![Ticket details](images/任务详情.png)

Clicking a list row, a task-index entry below the graph, or a ticket on the acceptance page opens the same ticket details. On a wide screen the details appear on the right; in a narrow panel they adapt to full width. The view includes task status, prerequisites, the original acceptance checklist, and the Markdown source. Prerequisite links can also open another ticket.

Acceptance markers mean: `[ ]` unchecked, `[~]` implemented and awaiting acceptance, and `[x]` accepted. The example tickets are complete but their checklists remain unchecked, so the page asks the user to review the records. This does not mean implementation failed. The page is read-only; update the original Markdown files to change the records.

## 05 / Enter architecture through the SDD architecture stage

![SDD architecture design](images/SDD架构设计.png)

Architecture reference material appears only under “架构设计” (Architecture Design) in SDD. It is not mixed into the specification, development progress, ticket list, or dependency graph. The architecture page keeps four separate states: current architecture, target architecture, actual architecture, and long-term baseline.

The example is a greenfield project: the current architecture may be absent, the target and actual architectures are approved, and the long-term baseline is verified. Planned and actual architecture reviews are shown separately; the planned diagram does not stand in for the implementation result.

“实际架构复核” (Actual Architecture Review) distinguishes implementation completion, delivery verification, tool validation, and user approval. “修订绑定” (Revision Binding), “受影响组件” (Affected Components), and “绑定工单” (Linked Tickets) preserve the summary, stable component IDs, and relationships. Valid component links can focus the corresponding nodes in the full graph. When approval is stale or a component is invalid, the page shows diagnostics and the backend continues to enforce the related development conditions.

![Full architecture graph: from specification to long-term baseline](images/架构大图.png)

“展开大图” (Open Full Graph) displays the existing Archify HTML. Human approval is a process node in the diagram; the page itself has no approve or edit button. The service continues to validate paths, integrity, and receipts, and displays the artifact with restricted response headers and a sandbox. The architecture content shown above did not change with the workbench layout.

## 06 / Review verification and delivery after tickets are complete

![Verification and delivery](images/SDD验收与交付.png)

“验证与交付” (Verification and Delivery) aggregates the acceptance checklists and lists the number of items still needing review for each ticket. The current view shows `0 / 16` confirmed; clicking any ticket opens its original entries.

Test and review results, interface-verification records, and release readback are not yet provided in the snapshot. The page states this explicitly instead of inferring failure or inventing execution records. It does not run tests, approve work, or publish releases.

## Use it in the Codex right panel

After installing the [companion skill](../README.en.md#connect-it-to-codex-and-the-matt-workflow), tell Codex “启动开发任务视图” (start the development task view) from the target project. The agent starts or reuses that project's local service and calls `open_in_codex` with `placement: "right"` to open the page. These screenshots show the web content; a same-window screenshot containing both the Codex application and right panel has not yet been included.

## Run it yourself

```sh
git clone https://github.com/Zziy-Q/matt-task-view.git
cd matt-task-view
node src/cli.mjs serve --port 0
```

Open the local URL printed in the terminal to inspect the repository's real records. The page watches `.scratch/` tickets and the `docs/architecture/` baseline and refreshes automatically when they change. The selected view, feature, filter, and ticket are kept in URL query parameters so a refresh or return opens the same place. See the [README](../README.en.md) for more usage details and [Authentication and Request Flow](authentication-and-request-flow.en.md) for authentication and data boundaries.
