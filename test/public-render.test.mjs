import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

async function renderer() {
  const source = await readFile(new URL("../src/public/app.js", import.meta.url), "utf8");
  const app = { innerHTML: "", textContent: "", querySelectorAll: () => [], querySelector: () => ({ innerHTML: "", insertAdjacentHTML() {}, addEventListener() {} }) };
  const context = createContext({
    document: { querySelector: () => app },
    EventSource: class { addEventListener() {} },
    fetch: async () => { throw new Error("No network in renderer tests"); },
  });
  runInContext(source, context);
  return (expression) => runInContext(expression, context);
}

test("architecture reference stays in the SDD architecture stage only", async () => {
  const run = await renderer();
  const task = (feature) => ({ id: `${feature}/01`, localId: "01", feature, title: `${feature} ticket`, phase: "实现", status: "done", dependsOn: [], acceptanceCriteria: [], path: `/repo/.scratch/${feature}/issues/01.md` });
  const graph = { features: ["design", "product"], tasks: [task("design"), task("product")], specs: [{ feature: "design", view: "architecture", title: "架构设计门禁与中文架构阶段卡片", sections: {}, path: "/repo/.scratch/design/spec.md" }, { feature: "product", title: "实际开发", sections: {}, path: "/repo/.scratch/product/spec.md" }], architectures: [{ feature: "design", status: "approved", developmentGatePassed: true, artifactDisplayable: true, nextStep: "已批准", components: [] }], frontier: [], edges: [], errors: [] };
  run(`render(${JSON.stringify(graph)})`);
  const html = run('document.querySelector("#app").innerHTML');
  assert.match(html, /SDD 开发流程/);
  assert.match(html, /class="sdd-card [^"]* architecture-card"/);
  assert.match(html, /\/architecture\/design\/artifact.html/);
  assert.doesNotMatch(html, /架构设计门禁与中文架构阶段卡片|design ticket|\/workflow\/design\/|value="design"/);
  assert.match(html, /product ticket/);
  assert.equal(run(`summarize(visibleTasks(${JSON.stringify(graph)})).total`), 1);
  run('selectedFeature = "product"');
  assert.equal(run(`selectedArchitectures(${JSON.stringify(graph)}).length`), 1);
  graph.architectures[0].status = "pending_approval";
  graph.architectures[0].developmentGatePassed = false;
  graph.tasks[1].status = "ready";
  graph.frontier = ["product/01"];
  graph.architectures.push({ feature: "product", status: "approved", developmentGatePassed: true, artifactDisplayable: true, nextStep: "已批准", components: [] });
  run(`render(${JSON.stringify(graph)})`);
  const selected = run('document.querySelector("#app").innerHTML');
  assert.match(selected, /可开始 01/);
  assert.match(selected, /\/architecture\/product\/artifact.html/);
  assert.match(selected, /\/architecture\/design\/artifact.html/);
  assert.doesNotMatch(selected, /请选择一个功能查看可信架构/);

});

test("dependency diagrams use separate Archify views and retain external dependencies", async () => {
  const render = await renderer();
  const tasks = [
    { id: "alpha/01", localId: "01", feature: "alpha", title: "架构任务", phase: "实现", status: "done", dependsOn: [] },
    { id: "beta/01", localId: "01", feature: "beta", title: "视图任务", phase: "实现", status: "ready", dependsOn: ["alpha/01"] },
  ];
  const graph = { tasks, specs: [{ feature: "alpha", title: "架构功能" }], edges: [{ from: "alpha/01", to: "beta/01" }] };
  const html = render(`renderGraph(${JSON.stringify(graph)}, ${JSON.stringify(tasks)})`);
  assert.equal((html.match(/<iframe /g) || []).length, 2);
  assert.match(html, /架构功能/);
  assert.match(html, /<strong>beta<\/strong>/);
  assert.match(html, /src="\/workflow\/alpha\/artifact\.html\?embed=1&theme=light"/);
  assert.match(html, /src="\/workflow\/beta\/artifact\.html\?embed=1&theme=light"/);
  assert.match(html, /data-task="alpha\/01" title="架构任务"/);
  assert.match(html, /data-task="beta\/01" title="视图任务"/);
  assert.match(html, /跨功能依赖/);
  assert.match(html, /beta\/01 ← alpha\/01/);
  const filtered = render(`renderGraph(${JSON.stringify(graph)}, ${JSON.stringify([tasks[1]])})`);
  assert.equal((filtered.match(/<iframe /g) || []).length, 1);
  assert.match(filtered, /beta\/01 ← alpha\/01/);
  assert.equal(render(`renderGraph(${JSON.stringify(graph)}, [])`), "");
  render('collapsedGraphFeatures.add("alpha")');
  const collapsed = render(`renderGraph(${JSON.stringify(graph)}, ${JSON.stringify(tasks)})`);
  assert.match(collapsed, /class="feature-graph" data-feature="alpha"/);
  assert.match(collapsed, /class="feature-graph" open data-feature="beta"/);
});

test("feature diagrams expand independently into the isolated Archify artifact", async () => {
  const render = await renderer();
  const tasks = [
    { id: "demo/01", localId: "01", feature: "demo", title: "第一步", phase: "实现", status: "done", dependsOn: [] },
    { id: "demo/02", localId: "02", feature: "demo", title: "第二步", phase: "实现", status: "ready", dependsOn: ["demo/01"] },
  ];
  const graph = { tasks, specs: [], edges: [{ from: "demo/01", to: "demo/02" }] };
  const html = render(`renderGraph(${JSON.stringify(graph)}, ${JSON.stringify(tasks)})`);
  assert.match(html, /<details class="feature-graph" open data-feature="demo"><summary>/);
  assert.match(html, /收起/);
  assert.match(html, /展开/);
  assert.match(html, /href="\/workflow\/demo\/artifact\.html\?theme=light"/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /ARCHIFY · 任务依赖/);
});

test("task list separates repeated local numbers into collapsible feature groups", async () => {
  const render = await renderer();
  const task = (feature, title) => ({ id: `${feature}/01`, localId: "01", feature, title, phase: "实现", status: "done", path: `/repo/.scratch/${feature}/issues/01.md`, blockedReason: "", acceptanceCriteria: [] });
  const tasks = [task("alpha", "架构任务"), task("beta", "视图任务")];
  const graph = { specs: [{ feature: "alpha", title: "架构功能" }] };
  const html = render(`taskList(${JSON.stringify(tasks)}, ${JSON.stringify(graph)})`);
  assert.equal((html.match(/class="task-feature-group" open/g) || []).length, 2);
  assert.match(html, /架构功能/);
  assert.match(html, /<strong>beta<\/strong>/);
  assert.equal((html.match(/<span class="task-id">01<\/span>/g) || []).length, 2);
  render('collapsedTaskFeatures.add("alpha")');
  const collapsed = render(`taskList(${JSON.stringify(tasks)}, ${JSON.stringify(graph)})`);
  assert.match(collapsed, /class="task-feature-group" data-feature="alpha"/);
  assert.match(collapsed, /class="task-feature-group" open data-feature="beta"/);
});

test("spec view renders every local section without empty hard-coded fields", async () => {
  const render = await renderer();
  const specs = [{
    title: "Commerce Harness V1",
    path: "/repo/.scratch/commerce-harness-v1/spec.md",
    sections: {
      背景: "保留 DSH 官方能力。",
      目标: "接入三个只读业务纵切。",
      边界: "禁止写入、刷新、生成和发布。",
    },
  }];

  const html = render(`specContent(${JSON.stringify(specs)})`);

  assert.match(html, /背景/);
  assert.match(html, /保留 DSH 官方能力/);
  assert.match(html, /目标/);
  assert.match(html, /接入三个只读业务纵切/);
  assert.match(html, /边界/);
  assert.match(html, /禁止写入、刷新、生成和发布/);
  assert.doesNotMatch(html, /<dd><\/dd>/);
});

test("implementation detail keeps every task and checked acceptance criterion visible", async () => {
  const render = await renderer();
  const tasks = [
    { id: "demo/01", localId: "01", feature: "demo", phase: "Foundation", title: "完成基线", status: "done", blockedReason: "", dependsOn: [], acceptanceCriteria: [{ text: "基线已验证", state: "accepted" }] },
    { id: "demo/02", localId: "02", feature: "demo", phase: "Foundation", title: "读取 Inventory", status: "in_progress", blockedReason: "", dependsOn: ["demo/01"], acceptanceCriteria: [{ text: "Shopify 待读取", state: "pending" }, { text: "BLACKWHALE 已开发", state: "implemented" }] },
    { id: "demo/03", localId: "03", feature: "demo", phase: "Foundation", title: "建立扩展 seam", status: "ready", blockedReason: "", dependsOn: ["demo/02"], acceptanceCriteria: [{ text: "扩展待实现", state: "pending" }] },
  ];
  const graph = { errors: [], frontier: [], specs: [], tasks };
  const summary = { total: 3, done: 1, in_progress: 1, ready: 1, blocked: 0, progressPercent: 33 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);

  assert.match(html, /完成基线/);
  assert.match(html, /读取 Inventory/);
  assert.match(html, /建立扩展 seam/);
  assert.match(html, /基线已验证/);
  assert.match(html, /BLACKWHALE 已开发/);
  assert.match(html, /Shopify 待读取/);
  assert.match(html, /aria-label="验收完成：基线已验证"/);
  assert.match(html, /aria-label="已开发，待验收：BLACKWHALE 已开发"/);
  assert.match(html, /aria-label="未开发：Shopify 待读取"/);
  assert.match(html, />☑<\/span>/);
  assert.match(html, />▲<\/span>/);
  assert.match(html, />○<\/span>/);
});

test("pending architecture renders as the second native SDD stage with a safe Chinese overview", async () => {
  const render = await renderer();
  const tasks = [{
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "ready", blockedReason: "", dependsOn: [], acceptanceCriteria: [],
  }];
  const architecture = {
    feature: "demo",
    path: "/private/repo/.scratch/demo/architecture",
    required: true,
    mode: "greenfield",
    reason: "新增接口服务与浏览器隔离边界。",
    status: "pending_approval",
    developmentGatePassed: false,
    artifactDisplayable: true,
    nextStep: "请明确批准当前架构修订。",
    lifecycle: { current: "absent", target: "pending_approval" },
    hashes: {
      currentSpecification: "a".repeat(64),
      receiptSpecification: "a".repeat(64),
      approvedSpecification: null,
      currentArtifact: "b".repeat(64),
      receiptArtifact: "b".repeat(64),
    },
    verification: {
      receiptSupported: true,
      receiptValid: true,
      specificationMatches: true,
      artifactMatches: true,
      artifactBytesMatch: true,
      toolValidation: { errors: 0, warnings: 0 },
    },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const graph = { errors: [], frontier: [], specs: [], tasks, architectures: [architecture] };
  const summary = { total: 1, done: 0, in_progress: 0, ready: 1, blocked: 0, progressPercent: 0 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);

  assert.ok(html.indexOf("规格与边界") < html.indexOf("架构设计"));
  assert.ok(html.indexOf("架构设计") < html.indexOf("任务计划"));
  assert.match(html, /请明确批准当前架构修订/);
  assert.match(html, /设计类型/);
  assert.match(html, /绿地规划/);
  assert.match(html, /新增接口服务与浏览器隔离边界/);
  assert.match(html, /代码证据/);
  assert.match(html, /当前架构/);
  assert.match(html, /批准修订/);
  assert.match(html, /接口服务/);
  assert.match(html, /绑定工单/);
  assert.match(html, /等待架构门禁/);
  assert.match(html, /<details class="sdd-card in_progress architecture-card" open>/);
  assert.match(html, /title="Archify 架构图概览"/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.doesNotMatch(html, /allow-same-origin/);
  assert.match(html, /href="\/architecture\/demo\/artifact\.html\?theme=light"/);
  assert.match(html, /src="\/architecture\/demo\/artifact\.html\?embed=1&amp;theme=light"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /\/private\/repo/);
});

test("explicit no-impact architecture decision shows its reason without claiming a broken artifact", async () => {
  const render = await renderer();
  const architecture = {
    feature: "copy-change",
    required: false,
    mode: "existing",
    reason: "只修改中文文案，不改变组件、接口、数据流或部署。",
    status: "not_required",
    developmentGatePassed: true,
    artifactDisplayable: false,
    nextStep: "已记录无架构影响，可以进入任务计划。",
    lifecycle: { current: "recovery_required", target: "not_required" },
    hashes: {},
    verification: {},
    components: [],
  };
  const graph = { errors: [], frontier: [], specs: [], tasks: [], architectures: [architecture] };
  const summary = { total: 0, done: 0, in_progress: 0, ready: 0, blocked: 0, progressPercent: 0 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, [], ${JSON.stringify(summary)})`);

  assert.match(html, /无需架构设计/);
  assert.match(html, /只修改中文文案，不改变组件、接口、数据流或部署/);
  assert.doesNotMatch(html, /架构图不可展示/);
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /architecture-card" open/);
});

test("legacy snapshots without architecture facts keep a compatible five-stage empty state", async () => {
  const render = await renderer();
  const tasks = [{
    id: "legacy/01", localId: "01", feature: "legacy", phase: "维护", title: "修复旧功能", status: "ready", blockedReason: "", dependsOn: [], acceptanceCriteria: [],
  }];
  const graph = { errors: [], frontier: ["legacy/01"], specs: [], tasks };
  const summary = { total: 1, done: 0, in_progress: 0, ready: 1, blocked: 0, progressPercent: 0 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);

  assert.equal((html.match(/class="sdd-card /g) || []).length, 5);
  assert.match(html, /架构设计/);
  assert.match(html, /兼容无架构记录的旧功能/);
  assert.match(html, /此旧功能没有架构记录/);
  assert.doesNotMatch(html, /architecture-card" open/);
  assert.match(html, /可开始 01/);
});

test("architecture status controls disclosure without confusing stale and tampered artifacts", async () => {
  const render = await renderer();
  const tasks = [{
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "in_progress", blockedReason: "", dependsOn: [], acceptanceCriteria: [],
  }];
  const base = {
    feature: "demo",
    required: true,
    mode: "existing",
    reason: "新增接口服务。",
    developmentGatePassed: true,
    artifactDisplayable: true,
    nextStep: "架构已批准，可以进入任务计划。",
    lifecycle: { current: "recovery_required", target: "approved" },
    hashes: { currentSpecification: "a".repeat(64), receiptSpecification: "a".repeat(64), approvedSpecification: "a".repeat(64) },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const summary = { total: 1, done: 0, in_progress: 1, ready: 0, blocked: 0, progressPercent: 0 };
  const graph = (architecture) => ({ errors: [], frontier: [], specs: [], tasks, architectures: [architecture] });

  const approved = render(`sddFlow(${JSON.stringify(graph({ ...base, status: "approved" }))}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);
  const stale = render(`sddFlow(${JSON.stringify(graph({ ...base, status: "source_changed", developmentGatePassed: false, nextStep: "请重新交付并批准。", lifecycle: { current: "recovery_required", target: "source_changed" } }))}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);
  const tampered = render(`sddFlow(${JSON.stringify(graph({ ...base, status: "artifact_tampered", developmentGatePassed: false, artifactDisplayable: false, nextStep: "请重新交付。", lifecycle: { current: "recovery_required", target: "artifact_tampered" } }))}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);

  assert.match(approved, /class="sdd-card done architecture-card"/);
  assert.doesNotMatch(approved, /architecture-card" open/);
  assert.match(stale, /class="sdd-card blocked architecture-card" open/);
  assert.match(stale, /最后可信交付图/);
  assert.match(stale, /当前未批准架构组件/);
  assert.match(stale, /不属于下面的最后可信交付图/);
  assert.match(stale, /<iframe/);
  assert.match(tampered, /class="sdd-card blocked architecture-card" open/);
  assert.match(tampered, /架构图不可展示/);
  assert.doesNotMatch(tampered, /<iframe/);
});

test("approved architecture renders bound tickets and stable component focus links", async () => {
  const render = await renderer();
  const revision = "a".repeat(64);
  const architecture = {
    feature: "demo",
    required: true,
    mode: "greenfield",
    reason: "新增接口服务。",
    status: "approved",
    developmentGatePassed: true,
    artifactDisplayable: true,
    nextStep: "架构已批准，可以进入任务计划。",
    lifecycle: { current: "absent", target: "approved" },
    hashes: { currentSpecification: revision, receiptSpecification: revision, approvedSpecification: revision },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const tasks = [{
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "ready", blockedReason: "", dependsOn: [], acceptanceCriteria: [],
    architectureRevision: revision,
    affects: ["api"],
    affectedComponents: [{ id: "api", type: "backend", label: "接口服务" }],
    bindingStatus: "valid",
    architectureDiagnostics: [],
    path: "/repo/.scratch/demo/issues/01-build.md",
  }];
  const graph = { errors: [], frontier: ["demo/01"], specs: [], tasks, architectures: [architecture] };

  const architectureHtml = render(`architectureContent(${JSON.stringify([architecture])}, ${JSON.stringify(tasks)})`);
  const taskHtml = render(`taskList(${JSON.stringify(tasks)}, ${JSON.stringify(graph)})`);

  assert.match(architectureHtml, /绑定工单/);
  assert.match(architectureHtml, /实现接口/);
  assert.match(architectureHtml, /接口服务/);
  assert.match(architectureHtml, /href="\/architecture\/demo\/artifact\.html\?theme=light#focus=api"/);
  assert.match(taskHtml, /架构修订/);
  assert.match(taskHtml, new RegExp(revision));
  assert.match(taskHtml, /影响组件/);
  assert.match(taskHtml, /接口服务/);
  assert.match(taskHtml, /#focus=api/);
});

test("component focus links preserve long labels and stable IDs with public wrapping styles", async () => {
  const render = await renderer();
  const id = "component-with-an-extremely-long-stable-identifier-that-must-wrap";
  const label = "负责跨区域异步任务编排与失败恢复的超长中文组件名称";
  const task = {
    id: "demo/01", feature: "demo", architectureRevision: "a".repeat(64), affects: [id],
    affectedComponents: [{ id, type: "backend", label }], bindingStatus: "valid", architectureDiagnostics: [],
  };
  const architecture = {
    feature: "demo",
    status: "approved",
    workflowStatus: "approved",
    developmentGatePassed: true,
    artifactDisplayable: true,
    lifecycle: { target: "approved" },
  };

  const html = render(`taskAffectedComponents(${JSON.stringify(task)}, ${JSON.stringify(architecture)})`);
  const styles = await readFile(new URL("../src/public/app.css", import.meta.url), "utf8");

  assert.match(html, new RegExp(label));
  assert.match(html, new RegExp(id));
  assert.match(html, new RegExp(`#focus=${id}`));
  assert.match(styles, /\.architecture-affects-values a \{[^}]*max-width: 100%;[^}]*min-width: 0;[^}]*flex-wrap: wrap;[^}]*overflow-wrap: anywhere;/s);
  assert.match(styles, /\.architecture-affects-values a strong \{[^}]*color: var\(--text\);/s);
  assert.match(styles, /\.architecture-affects-values small \{[^}]*color: var\(--text-secondary\);/s);
});

test("component focus requires an approved known architecture with a passing development gate", async () => {
  const render = await renderer();
  const task = {
    id: "demo/01",
    feature: "demo",
    affects: ["api"],
    affectedComponents: [{ id: "api", type: "backend", label: "接口服务" }],
    bindingStatus: "valid",
    architectureDiagnostics: [],
  };
  const approved = {
    feature: "demo",
    status: "approved",
    workflowStatus: "approved",
    developmentGatePassed: true,
    artifactDisplayable: true,
    lifecycle: { target: "approved" },
  };
  const rejected = [
    { ...approved, status: "source_changed" },
    { ...approved, workflowStatus: "future_closure_state" },
    { ...approved, workflowStatus: "" },
    { ...approved, developmentGatePassed: false },
    { ...approved, lifecycle: { target: "future_target_state" } },
  ];

  assert.match(render(`taskAffectedComponents(${JSON.stringify(task)}, ${JSON.stringify(approved)})`), /#focus=api/);
  for (const architecture of rejected) {
    assert.doesNotMatch(render(`taskAffectedComponents(${JSON.stringify(task)}, ${JSON.stringify(architecture)})`), /#focus=/);
  }
});

test("source-changed bindings show only their original component IDs without focus links", async () => {
  const render = await renderer();
  const revision = "a".repeat(64);
  const architecture = {
    feature: "demo",
    required: true,
    mode: "existing",
    reason: "架构源已修改。",
    status: "source_changed",
    developmentGatePassed: false,
    artifactDisplayable: true,
    nextStep: "请重新交付并批准。",
    lifecycle: { current: "recovery_required", target: "source_changed" },
    hashes: { currentSpecification: "b".repeat(64), receiptSpecification: revision, approvedSpecification: revision },
    components: [{ id: "worker", type: "backend", label: "新任务执行器" }],
  };
  const tasks = [{
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现旧接口", status: "ready", blockedReason: "", dependsOn: [], acceptanceCriteria: [],
    architectureRevision: revision,
    affects: ["api"],
    affectedComponents: [],
    bindingStatus: "unverifiable",
    architectureDiagnostics: [{ code: "architecture_approval_unverifiable", message: "批准修订不可验证。", path: "/repo/.scratch/demo/issues/01-build.md" }],
    path: "/repo/.scratch/demo/issues/01-build.md",
  }];
  const graph = { errors: [], frontier: [], specs: [], tasks, architectures: [architecture] };

  const architectureHtml = render(`architectureContent(${JSON.stringify([architecture])}, ${JSON.stringify(tasks)})`);
  const taskHtml = render(`taskList(${JSON.stringify(tasks)}, ${JSON.stringify(graph)})`);

  assert.match(architectureHtml, /实现旧接口/);
  assert.match(architectureHtml, /原组件 ID/);
  assert.match(architectureHtml, /<code>api<\/code>/);
  assert.doesNotMatch(architectureHtml, /#focus=/);
  assert.match(taskHtml, /原组件 ID/);
  assert.match(taskHtml, /<code>api<\/code>/);
  assert.doesNotMatch(taskHtml, /#focus=/);
});

test("invalid architecture bindings stay visible with Chinese ticket diagnostics when metadata is missing", async () => {
  const render = await renderer();
  const architecture = {
    feature: "demo",
    required: true,
    mode: "greenfield",
    reason: "新增接口服务。",
    status: "approved",
    developmentGatePassed: true,
    artifactDisplayable: true,
    nextStep: "架构已批准，可以进入任务计划。",
    lifecycle: { current: "absent", target: "approved" },
    hashes: { currentSpecification: "a".repeat(64), receiptSpecification: "a".repeat(64), approvedSpecification: "a".repeat(64) },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const tasks = [{
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "ready", blockedReason: "", dependsOn: [], acceptanceCriteria: [],
    architectureRevision: null,
    affects: [],
    affectedComponents: [],
    bindingStatus: "invalid",
    architectureDiagnostics: [
      { code: "missing_architecture_revision", message: "需要架构设计的工单必须填写 architecture_revision。", path: "/repo/.scratch/demo/issues/01-build.md" },
      { code: "missing_architecture_affects", message: "需要架构设计的工单必须填写非空 affects 列表。", path: "/repo/.scratch/demo/issues/01-build.md" },
    ],
    path: "/repo/.scratch/demo/issues/01-build.md",
  }];
  const graph = { errors: [], frontier: [], specs: [], tasks, architectures: [architecture] };

  const architectureHtml = render(`architectureContent(${JSON.stringify([architecture])}, ${JSON.stringify(tasks)})`);
  const taskHtml = render(`taskList(${JSON.stringify(tasks)}, ${JSON.stringify(graph)})`);

  for (const html of [architectureHtml, taskHtml]) {
    assert.match(html, /实现接口/);
    assert.match(html, /绑定有误/);
    assert.match(html, /必须填写 architecture_revision/);
    assert.match(html, /必须填写非空 affects 列表/);
  }
  assert.doesNotMatch(architectureHtml, /尚无架构绑定工单/);
});

test("ticket architecture diagnostics block the plan summary and remain visible in task rows", async () => {
  const render = await renderer();
  const architecture = {
    feature: "demo",
    required: true,
    mode: "greenfield",
    reason: "新增接口服务。",
    status: "approved",
    developmentGatePassed: true,
    artifactDisplayable: true,
    nextStep: "架构已批准，可以进入任务计划。",
    lifecycle: { current: "absent", target: "approved" },
    hashes: { currentSpecification: "a".repeat(64), receiptSpecification: "a".repeat(64), approvedSpecification: "a".repeat(64) },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const tasks = [{
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "ready", blockedReason: "", dependsOn: [], acceptanceCriteria: [],
    architectureRevision: null,
    affects: [],
    affectedComponents: [],
    bindingStatus: "invalid",
    architectureDiagnostics: [{ code: "missing_architecture_revision", message: "需要架构设计的工单必须填写 architecture_revision。", path: "/repo/.scratch/demo/issues/01-build.md" }],
    path: "/repo/.scratch/demo/issues/01-build.md",
  }];
  const graph = { errors: [], frontier: [], specs: [], tasks, architectures: [architecture] };
  const summary = { total: 1, done: 0, in_progress: 0, ready: 1, blocked: 0, progressPercent: 0 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);

  assert.match(html, /先修正 01 的架构绑定诊断/);
  assert.match(html, /<details class="sdd-card blocked"><summary>[\s\S]*?<strong>任务计划<\/strong>/);
  assert.match(html, /需要架构设计的工单必须填写 architecture_revision/);
  assert.doesNotMatch(html, /依赖已校验/);
});

test("actual architecture review opens the A-stage card without inventing delivery completion", async () => {
  const render = await renderer();
  const architecture = {
    feature: "demo",
    required: true,
    mode: "greenfield",
    reason: "规划架构。",
    status: "approved",
    workflowStatus: "actual_pending_review",
    developmentGatePassed: true,
    artifactDisplayable: true,
    nextStep: "复核规划与实际差异，再决定是否提升长期基线。",
    lifecycle: { current: "absent", target: "approved", actual: "pending_review", baseline: "missing" },
    hashes: { currentSpecification: "a".repeat(64), receiptSpecification: "a".repeat(64), approvedSpecification: "a".repeat(64) },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
    implementationComplete: true,
    deliveryVerified: true,
    toolValidationPassed: true,
    userApproved: false,
    actual: {
      reason: "实现完成后的总体复核说明。",
      differences: [{ kind: "changed", componentId: "api", summary: "接口已落地", rationale: "与实现保持一致" }],
    },
    baseline: { status: "missing", sourceFeature: "" },
  };
  const tasks = [{ id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "done", blockedReason: "", dependsOn: [], acceptanceCriteria: [] }];
  const graph = { errors: [], frontier: [], specs: [], tasks, architectures: [architecture] };
  const summary = { total: 1, done: 1, in_progress: 0, ready: 0, blocked: 0, progressPercent: 100 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, ${JSON.stringify(tasks)}, ${JSON.stringify(summary)})`);

  assert.match(html, /class="sdd-card in_progress architecture-card" open/);
  assert.match(html, /实际架构待复核/);
  assert.match(html, /当前架构/);
  assert.match(html, /目标架构/);
  assert.match(html, /实际架构/);
  assert.match(html, /长期基线/);
  assert.match(html, /实现完成/);
  assert.match(html, /交付核验/);
  assert.match(html, /工具校验/);
  assert.match(html, /用户批准/);
  assert.match(html, /接口已落地/);
  assert.match(html, /与实现保持一致/);
  assert.match(html, /复核规划与实际差异/);
  assert.doesNotMatch(html, /已交付/);
  assert.doesNotMatch(html, /批准实际架构|复制到基线/);
});

test("architecture review prose and warnings wrap unbroken text inside the narrow card", async () => {
  const styles = await readFile(new URL("../src/public/app.css", import.meta.url), "utf8");

  assert.match(styles, /\.architecture-section > p[^{]*\{[^}]*overflow-wrap: anywhere;/s);
  assert.match(styles, /\.architecture-warning[^{]*\{[^}]*overflow-wrap: anywhere;/s);
});

test("architecture lifecycle labels use a text color with at least 4.5 to 1 contrast", async () => {
  const styles = await readFile(new URL("../src/public/app.css", import.meta.url), "utf8");
  const color = styles.match(/--text-secondary:\s*(#[0-9a-f]{6})/i)?.[1];
  const background = styles.match(/--surface:\s*(#[0-9a-f]{6})/i)?.[1];
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  };

  assert.match(styles, /\.architecture-lifecycle dt\s*\{[^}]*color: var\(--text-secondary\);/s);
  assert.ok((luminance(background) + 0.05) / (luminance(color) + 0.05) >= 4.5);
});

test("actual architecture review preserves approved planned component focus links", async () => {
  const render = await renderer();
  const revision = "a".repeat(64);
  const architecture = {
    feature: "demo", status: "approved", workflowStatus: "actual_pending_review",
    artifactDisplayable: true, developmentGatePassed: true, nextStep: "复核实际架构。",
    lifecycle: { current: "absent", target: "approved", actual: "pending_review", baseline: "missing" },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const tasks = [{
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "in_progress",
    blockedReason: "", dependsOn: [], acceptanceCriteria: [], architectureRevision: revision, affects: ["api"],
    affectedComponents: [{ id: "api", type: "backend", label: "接口服务" }], bindingStatus: "valid", architectureDiagnostics: [],
  }];
  const graph = { errors: [], frontier: [], specs: [], tasks, architectures: [architecture] };

  const detail = render(`taskArchitectureDetail(${JSON.stringify(tasks[0])}, ${JSON.stringify(graph)})`);

  assert.match(detail, /#focus=api/);
});

test("source-changed active work shows a safe checkpoint without component focus links", async () => {
  const render = await renderer();
  const revision = "a".repeat(64);
  const architecture = {
    feature: "demo", status: "source_changed", workflowStatus: "source_changed",
    artifactDisplayable: true, developmentGatePassed: false, nextStep: "重新交付并批准规划架构。",
    lifecycle: { current: "absent", target: "source_changed", actual: "missing", baseline: "missing" },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const task = {
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "in_progress",
    blockedReason: "", dependsOn: [], acceptanceCriteria: [], architectureRevision: revision, affects: ["api"],
    affectedComponents: [], bindingStatus: "unverifiable", architectureDiagnostics: [],
    architectureAction: { state: "pause_at_safe_checkpoint", message: "架构批准已过期；完成当前安全检查点后暂停，重新批准后继续。" },
  };
  const graph = { errors: [], frontier: [], specs: [], tasks: [task], architectures: [architecture] };
  const summary = { total: 1, done: 0, in_progress: 1, ready: 0, blocked: 0, progressPercent: 0 };

  const flow = render(`sddFlow(${JSON.stringify(graph)}, ${JSON.stringify([task])}, ${JSON.stringify(summary)})`);
  const detail = render(`taskArchitectureDetail(${JSON.stringify(task)}, ${JSON.stringify(graph)})`);

  assert.match(flow, /安全检查点后暂停/);
  assert.match(detail, /安全检查点后暂停/);
  assert.doesNotMatch(flow, /#focus=/);
  assert.doesNotMatch(detail, /#focus=/);
});

test("unknown planning status fails closed and foreign baseline ownership stays explicit", async () => {
  const render = await renderer();
  const architecture = {
    feature: "demo", status: "future_state", workflowStatus: "baseline_pending",
    developmentGatePassed: true, artifactDisplayable: false, nextStep: "未知。",
    lifecycle: { current: "unknown", target: "future_state", actual: "approved", baseline: "foreign_feature" },
    actual: { differences: [] }, baseline: { status: "foreign_feature", sourceFeature: "other-feature" }, components: [],
  };
  const graph = { errors: [], frontier: [], specs: [], tasks: [], architectures: [architecture] };
  const summary = { total: 0, done: 0, in_progress: 0, ready: 0, blocked: 0, progressPercent: 0 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, [], ${JSON.stringify(summary)})`);

  assert.match(html, /未知架构状态/);
  assert.match(html, /当前项目基线来自 other-feature/);
  assert.match(html, /等待架构门禁/);
  assert.doesNotMatch(html, /展示工件被篡改/);
});

test("unknown architecture workflow and target states stay blocked and open", async () => {
  const render = await renderer();
  const task = {
    id: "demo/01", localId: "01", feature: "demo", phase: "实现", title: "实现接口", status: "ready",
    blockedReason: "", dependsOn: [], acceptanceCriteria: [], affects: ["api"],
    affectedComponents: [{ id: "api", type: "backend", label: "接口服务" }], bindingStatus: "valid", architectureDiagnostics: [],
  };
  const approved = {
    feature: "demo", required: true, mode: "greenfield", reason: "新增接口服务。",
    status: "approved", workflowStatus: "approved", developmentGatePassed: true, artifactDisplayable: true,
    nextStep: "架构状态需要确认。", lifecycle: { current: "absent", target: "approved", actual: "missing", baseline: "missing" },
    components: [{ id: "api", type: "backend", label: "接口服务" }], hashes: {},
  };
  const unknownStates = [
    { ...approved, workflowStatus: "future_closure_state" },
    { ...approved, workflowStatus: "" },
    { ...approved, lifecycle: { ...approved.lifecycle, target: "future_target_state" } },
    { ...approved, lifecycle: { ...approved.lifecycle, target: "" } },
  ];
  const summary = { total: 1, done: 0, in_progress: 0, ready: 1, blocked: 0, progressPercent: 0 };

  for (const architecture of unknownStates) {
    const graph = { errors: [], frontier: ["demo/01"], specs: [], tasks: [task], architectures: [architecture] };
    const html = render(`sddFlow(${JSON.stringify(graph)}, ${JSON.stringify([task])}, ${JSON.stringify(summary)})`);
    assert.match(html, /class="sdd-card blocked architecture-card" open/);
    assert.match(html, /未知架构状态（已锁定）/);
    assert.match(html, /等待架构门禁/);
    assert.doesNotMatch(html, /#focus=/);
  }
});

test("multi-feature guidance counts unknown architecture states as blocked gates", async () => {
  const render = await renderer();
  const approved = {
    feature: "known", status: "approved", workflowStatus: "approved", developmentGatePassed: true,
    artifactDisplayable: true, nextStep: "可以开始。", lifecycle: { current: "absent", target: "approved" }, components: [], hashes: {},
  };
  const unknown = {
    ...approved,
    feature: "unknown",
    workflowStatus: "future_closure_state",
    nextStep: "需要确认。",
  };
  const graph = { errors: [], frontier: [], specs: [], tasks: [], architectures: [approved, unknown] };
  const summary = { total: 0, done: 0, in_progress: 0, ready: 0, blocked: 0, progressPercent: 0 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, [], ${JSON.stringify(summary)})`);

  assert.match(html, /先处理 1 个功能的架构门禁/);
  assert.doesNotMatch(html, /先处理 0 个功能/);
});

test("existing-system current baseline recovery is a blocked open architecture gate", async () => {
  const render = await renderer();
  const architecture = {
    feature: "demo", status: "approved", workflowStatus: "current_baseline_required",
    developmentGatePassed: false, artifactDisplayable: true,
    nextStep: "请先恢复并确认当前基线。",
    lifecycle: { current: "recovery_required", target: "approved", actual: "missing", baseline: "from_other_feature" },
    actual: { differences: [] }, baseline: { status: "from_other_feature", sourceFeature: "old-feature" }, components: [],
  };
  const graph = { errors: [], frontier: [], specs: [], tasks: [], architectures: [architecture] };
  const summary = { total: 0, done: 0, in_progress: 0, ready: 0, blocked: 0, progressPercent: 0 };

  const html = render(`sddFlow(${JSON.stringify(graph)}, [], ${JSON.stringify(summary)})`);

  assert.match(html, /class="sdd-card blocked architecture-card" open/);
  assert.match(html, /当前基线待确认/);
  assert.match(html, /请先恢复并确认当前基线/);
  assert.match(html, /当前项目基线来自 old-feature/);
});
