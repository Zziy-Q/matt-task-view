import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, runInContext } from "node:vm";
import test from "node:test";

async function renderer() {
  const source = await readFile(new URL("../src/public/app.js", import.meta.url), "utf8");
  const element = () => ({ innerHTML: "", textContent: "", querySelectorAll: () => [], addEventListener() {}, classList: { add() {} } });
  const app = element();
  const closeButton = element();
  const listeners = {};
  const eventListeners = {};
  const inspector = {
    ...element(), open: false,
    querySelector: () => closeButton,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    showModal() { this.open = true; },
    close() { this.open = false; listeners.close?.(); },
  };
  const location = { search: "" };
  const context = createContext({
    document: { querySelector: (selector) => ({ "#app": app, "#inspector": inspector })[selector] || null, querySelectorAll: () => [] },
    location, URLSearchParams,
    history: { replaceState: (_state, _title, url) => { location.search = url; } },
    window: { scrollTo() {} },
    EventSource: class { addEventListener(name, callback) { eventListeners[name] = callback; } },
    // Initial refresh stays pending; each test supplies its snapshot explicitly.
    fetch: () => new Promise(() => {}),
  });
  runInContext(source, context);
  const run = (expression) => runInContext(expression, context);
  return {
    run, app, inspector, location, emit: name => eventListeners[name](),
    load(snapshot, selection = {}) {
      run(`graph = ${JSON.stringify(snapshot)}; state = { view: 'overview', mode: 'list', feature: '', status: 'all', task: '', ...${JSON.stringify(selection)} }; render();`);
    },
  };
}

const revision = "a".repeat(64);
const task = (feature = "demo", localId = "01", overrides = {}) => ({
  id: `${feature}/${localId}`, localId, feature, title: `${feature} 工单 ${localId}`, phase: "实现",
  status: "done", dependsOn: [], blockedReason: "", acceptanceCriteria: [],
  path: `/private/repo/.scratch/${feature}/issues/${localId}.md`, ...overrides,
});
const architecture = (overrides = {}) => ({
  feature: "demo", required: true, mode: "greenfield", reason: "新增接口服务。",
  status: "approved", workflowStatus: "approved", developmentGatePassed: true, artifactDisplayable: true,
  nextStep: "架构已批准，可以进入任务计划。",
  lifecycle: { current: "absent", target: "approved", actual: "missing", baseline: "missing" },
  hashes: { currentSpecification: revision, receiptSpecification: revision, approvedSpecification: revision },
  components: [{ id: "api", type: "backend", label: "接口服务" }], ...overrides,
});
const snapshot = (overrides = {}) => ({ features: ["demo"], tasks: [], specs: [], architectures: [], frontier: [], edges: [], errors: [], ...overrides });
const boundTask = (overrides = {}) => task("demo", "01", {
  architectureRevision: revision, affects: ["api"], affectedComponents: [{ id: "api", type: "backend", label: "接口服务" }],
  bindingStatus: "valid", architectureDiagnostics: [], ...overrides,
});

test("architecture references stay inside the SDD architecture view and never block product work", async () => {
  const ui = await renderer();
  ui.load(snapshot({
    features: ["design", "product"], tasks: [task("design"), task("product", "01", { status: "ready" })],
    specs: [{ feature: "design", view: "architecture", title: "架构设计门禁与中文架构阶段卡片", sections: { 目标: "架构参考内容" } }, { feature: "product", title: "实际开发", sections: { 目标: "产品目标" } }],
    architectures: [architecture({ feature: "design", status: "pending_approval", workflowStatus: "pending_approval", developmentGatePassed: false, lifecycle: { target: "pending_approval" } })],
    frontier: ["product/01"],
  }));
  assert.equal(ui.run("state.feature"), "product");
  assert.equal(ui.run("counted().total"), 1);
  assert.equal(ui.run("nextStep().changes.task"), "product/01");
  assert.match(ui.app.innerHTML, /SDD 开发流程/);
  assert.match(ui.app.innerHTML, /data-view="architecture"/);
  assert.doesNotMatch(ui.app.innerHTML, /<iframe|value="design"|架构设计门禁与中文架构阶段卡片/);
  for (const view of ["specView()", "taskList()", "taskGraph()", "verificationView()"])
    assert.doesNotMatch(ui.run(view), /design 工单|架构参考内容|架构设计门禁与中文架构阶段卡片|\/workflow\/design\//);
  assert.match(ui.run("architectureView()"), /\/architecture\/design\/artifact.html/);
  ui.run("openTask('design/01')");
  assert.equal(ui.inspector.open, false);
});

test("list and collapsible Archify graph share the same task detail across refresh", async () => {
  const ui = await renderer();
  ui.load(snapshot({ tasks: [task(), task("demo", "02", { dependsOn: ["demo/01"] })] }), { view: "tasks" });
  assert.match(ui.run("taskList()"), /data-task="demo\/02"/);
  ui.run("openTask('demo/02')");
  const detail = ui.inspector.innerHTML;
  assert.equal(ui.inspector.open, true);
  assert.match(detail, /data-dependency="demo\/01"/);
  assert.match(ui.location.search, /task=demo%2F02/);
  ui.run("navigate({view:'tasks',mode:'graph'}); openTask('demo/02'); render()");
  assert.equal(ui.inspector.innerHTML, detail);
  assert.equal(ui.run("state.mode"), "graph");
  assert.match(ui.app.innerHTML, /data-task="demo\/02"/);
  assert.match(ui.app.innerHTML, /<details\b[^>]*>[\s\S]*?<summary\b/);
  assert.match(ui.app.innerHTML, /src="\/workflow\/demo\/artifact\.html\?embed=1(?:&|&amp;)theme=light"/);
  assert.match(ui.app.innerHTML, /sandbox="allow-scripts"/);
  assert.match(ui.app.innerHTML, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(ui.app.innerHTML, /allow-same-origin/);
  ui.inspector.close();
  assert.equal(ui.run("state.task"), "");
  assert.doesNotMatch(ui.location.search, /task=/);
  assert.equal(ui.run("state.mode"), "graph");
});

test("feature selection keeps repeated IDs separate and branch graphs retain external dependencies", async () => {
  const ui = await renderer();
  ui.load(snapshot({
    features: ["alpha", "beta"],
    tasks: [task("alpha"), task("beta", "01", { status: "ready", dependsOn: ["alpha/01"] }), task("beta", "02", { status: "ready", dependsOn: ["alpha/01"] })],
    edges: [{ from: "alpha/01", to: "beta/01" }, { from: "alpha/01", to: "beta/02" }],
  }), { feature: "beta", view: "tasks", mode: "graph" });
  assert.match(ui.app.innerHTML, /aria-label="选择功能"/);
  assert.match(ui.app.innerHTML, /data-task="beta\/01"/);
  assert.doesNotMatch(ui.app.innerHTML, /data-task="alpha\/01"/);
  assert.match(ui.app.innerHTML, /\/workflow\/beta\/artifact\.html\?embed=1(?:&|&amp;)theme=light/);
  assert.match(ui.app.innerHTML, /sandbox="allow-scripts"/);
  assert.match(ui.app.innerHTML, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(ui.app.innerHTML, /allow-same-origin/);
  assert.match(ui.app.innerHTML, /alpha\/01/);
  ui.run("openTask('beta/01')");
  assert.match(ui.inspector.innerHTML, /data-dependency="alpha\/01"/);
  ui.run("openTask('alpha/01')");
  assert.match(ui.inspector.innerHTML, /alpha 工单 01/);
  ui.run("navigate({feature:'alpha'})");
  assert.match(ui.app.innerHTML, /data-task="alpha\/01"/);
  assert.doesNotMatch(ui.app.innerHTML, /data-task="beta\/01"/);
  ui.run("graph.tasks[0].dependsOn = ['alpha/99']; openTask('alpha/01')");
  assert.match(ui.inspector.innerHTML, /alpha\/99/);
  assert.match(ui.inspector.innerHTML, /依赖工单缺失，待修正/);
  assert.doesNotMatch(ui.inspector.innerHTML, /无前置依赖/);
});

test("spec sections and task text are escaped without losing source content", async () => {
  const ui = await renderer();
  const unsafe = '<img src=x onerror="alert(1)"> & 原文';
  ui.load(snapshot({
    specs: [{ feature: "demo", title: unsafe, sections: { 背景: "保留已有能力。", 自定义边界: unsafe } }],
    tasks: [task("demo", "01", { title: unsafe, acceptanceCriteria: [{ text: unsafe, state: "pending" }] })],
  }));
  for (const html of [ui.app.innerHTML, ui.run("specView()"), ui.run("taskList()"), ui.run("taskGraph()")]) {
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; 原文/);
    assert.doesNotMatch(html, /<img /);
  }
  assert.match(ui.run("specView()"), /自定义边界/);
  assert.match(ui.run("specView()"), /保留已有能力/);
  ui.run("openTask('demo/01')");
  assert.doesNotMatch(ui.inspector.innerHTML, /<img |\/private\/repo/);
  assert.match(ui.inspector.innerHTML, /demo\/issues\/01.md/);
});

test("task completion and the three acceptance states stay independent", async () => {
  const ui = await renderer();
  ui.load(snapshot({ tasks: [task("demo", "01", { acceptanceCriteria: [
    { text: "清单未核对", state: "pending" }, { text: "代码已实现", state: "implemented" }, { text: "结果已验收", state: "accepted" },
  ] })] }));
  assert.equal(ui.run("counted().done"), 1);
  assert.equal(ui.run("counted().pending"), 2);
  assert.equal(ui.run("counted().accepted"), 1);
  assert.equal(ui.run("nextStep().changes.view"), "verification");
  ui.run("openTask('demo/01')");
  for (const label of ["未勾选", "已实现，待验收", "已验收", "清单未核对", "代码已实现", "结果已验收"])
    assert.ok(ui.inspector.innerHTML.includes(label));
  assert.match(ui.inspector.innerHTML, /工单已完成，清单仍未勾选/);
  assert.doesNotMatch(ui.inspector.innerHTML, /未开发/);
  const verification = ui.run("verificationView()");
  assert.match(verification, /1 张工单标记完成，2 项验收仍待核对/);
  assert.equal((verification.match(/快照未提供/g) || []).length, 3);
  assert.doesNotMatch(verification, /已交付|测试通过|发布成功/);
});

test("pending architecture routes the next action to its safe nested view", async () => {
  const ui = await renderer();
  ui.load(snapshot({
    tasks: [task("demo", "01", { status: "ready" })], frontier: ["demo/01"],
    architectures: [architecture({ status: "pending_approval", workflowStatus: "pending_approval", developmentGatePassed: false, nextStep: "请明确批准当前架构修订。", lifecycle: { current: "absent", target: "pending_approval" } })],
  }));
  assert.equal(ui.run("nextStep().changes.view"), "architecture");
  assert.ok(ui.app.innerHTML.indexOf("<strong>规格与边界</strong>") < ui.app.innerHTML.indexOf("<strong>架构设计</strong>"));
  assert.ok(ui.app.innerHTML.indexOf("<strong>架构设计</strong>") < ui.app.innerHTML.indexOf("<strong>任务计划</strong>"));
  assert.doesNotMatch(ui.app.innerHTML, /<iframe/);
  const html = ui.run("architectureView()");
  for (const text of ["请明确批准当前架构修订", "绿地规划", "新增接口服务", "批准修订", "接口服务"])
    assert.ok(html.includes(text));
  assert.match(html, /src="\/architecture\/demo\/artifact.html\?embed=1&amp;theme=light"/);
  assert.match(html, /sandbox="allow-scripts"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /allow-same-origin|\/private\/repo|#focus=/);
});

test("explicit no-impact and legacy architecture states do not invent approval or a broken artifact", async () => {
  const ui = await renderer();
  const graph = snapshot({ tasks: [task("demo", "01", { status: "ready" })], frontier: ["demo/01"] });
  ui.load(graph);
  assert.equal(ui.run("nextStep().changes.task"), "demo/01");
  assert.match(ui.run("architectureView()"), /此旧功能没有架构记录/);
  assert.doesNotMatch(ui.run("architectureView()"), /<iframe/);
  graph.architectures = [architecture({ required: false, status: "not_required", workflowStatus: "not_required", artifactDisplayable: false, reason: "只修改中文文案。", lifecycle: { target: "not_required" } })];
  ui.load(graph);
  assert.equal(ui.run("nextStep().changes.task"), "demo/01");
  const html = ui.run("architectureView()");
  assert.match(html, /无需架构设计|不需要生成架构展示工件/);
  assert.match(html, /只修改中文文案/);
  assert.doesNotMatch(html, /架构图不可展示|<iframe/);
});

test("stale, tampered and unknown architecture states fail closed without confusing their artifacts", async () => {
  const ui = await renderer();
  const variants = [
    architecture({ status: "source_changed", workflowStatus: "source_changed", developmentGatePassed: false, lifecycle: { target: "source_changed" } }),
    architecture({ status: "artifact_tampered", workflowStatus: "artifact_tampered", developmentGatePassed: false, artifactDisplayable: false, lifecycle: { target: "artifact_tampered" } }),
    architecture({ status: "future_state" }),
    architecture({ workflowStatus: "future_closure_state" }),
    architecture({ workflowStatus: "" }),
    architecture({ lifecycle: { target: "future_target_state" } }),
    architecture({ lifecycle: { target: "" } }),
  ];
  for (const a of variants) {
    ui.load(snapshot({ tasks: [boundTask({ status: "ready" })], frontier: ["demo/01"], architectures: [a] }));
    assert.equal(ui.run("nextStep().changes.view"), "architecture");
    const html = ui.run("architectureView()");
    assert.doesNotMatch(html, /#focus=/);
    if (a.status === "source_changed") {
      assert.match(html, /最后可信交付图/);
      assert.match(html, /当前未批准架构组件/);
      assert.match(html, /<iframe/);
    } else if (a.status === "artifact_tampered") {
      assert.match(html, /架构图不可展示/);
      assert.doesNotMatch(html, /<iframe/);
    } else {
      assert.match(html, /未知架构状态/);
      assert.doesNotMatch(html, /展示工件被篡改/);
    }
  }
});

test("component focus and binding diagnostics appear only in the architecture view", async () => {
  const ui = await renderer();
  const component = { id: "api-with-a-long-stable-component-identifier", type: "backend", label: "负责跨区域异步任务编排与失败恢复的超长中文组件名称" };
  const ticket = boundTask({ status: "ready", affects: [component.id], affectedComponents: [component] });
  const graph = snapshot({ tasks: [ticket], frontier: [ticket.id], architectures: [architecture({ components: [component] })] });
  ui.load(graph);
  const html = ui.run("architectureView()");
  assert.match(html, new RegExp(`#focus=${component.id}`));
  assert.ok(html.includes(component.label));
  assert.match(html, /绑定有效/);
  for (const expression of ["taskList()", "taskGraph()", "specView()", "verificationView()"])
    assert.doesNotMatch(ui.run(expression), /#focus=|影响组件|修订绑定/);
  ui.run("openTask('demo/01')");
  assert.doesNotMatch(ui.inspector.innerHTML, /#focus=|影响组件|修订绑定/);
  ticket.bindingStatus = "invalid";
  ticket.architectureDiagnostics = [{ message: "需要填写 architecture_revision 与非空 affects。" }];
  ui.load(graph);
  assert.equal(ui.run("nextStep().changes.view"), "architecture");
  assert.match(ui.run("architectureView()"), /绑定有误/);
  assert.match(ui.run("architectureView()"), /需要填写 architecture_revision 与非空 affects/);
  assert.doesNotMatch(ui.run("architectureView()"), /#focus=/);
  ticket.bindingStatus = "unverifiable";
  ui.load(graph);
  assert.match(ui.run("architectureView()"), /原组件 ID/);
  assert.doesNotMatch(ui.run("architectureView()"), /#focus=/);
});

test("actual review and foreign baselines retain their evidence without claiming delivery", async () => {
  const ui = await renderer();
  const a = architecture({
    workflowStatus: "actual_pending_review", nextStep: "复核规划与实际差异。",
    lifecycle: { current: "absent", target: "approved", actual: "pending_review", baseline: "foreign_feature" },
    implementationComplete: true, deliveryVerified: true, toolValidationPassed: true, userApproved: false,
    actual: { reason: "实现完成后的总体复核说明。", differences: [{ kind: "changed", componentId: "api", summary: "接口已落地", rationale: "与实现保持一致" }] },
    baseline: { status: "foreign_feature", sourceFeature: "other-feature" },
  });
  ui.load(snapshot({ tasks: [boundTask()], architectures: [a] }));
  const html = ui.run("architectureView()");
  for (const text of ["实际架构待复核", "当前架构", "目标架构", "实际架构", "长期基线", "交付核验", "工具校验", "用户批准", "接口已落地", "与实现保持一致", "当前项目基线来自 other-feature"])
    assert.ok(html.includes(text));
  assert.match(html, /#focus=api/);
  assert.doesNotMatch(html, /批准实际架构|复制到基线|已交付/);
  assert.doesNotMatch(ui.run("verificationView()"), /已交付/);
  a.workflowStatus = "current_baseline_required";
  a.developmentGatePassed = false;
  a.nextStep = "请先恢复并确认当前基线。";
  ui.load(snapshot({ tasks: [boundTask({ status: "in_progress", architectureAction: { state: "pause_at_safe_checkpoint", message: "完成当前安全检查点后暂停。" } })], architectures: [a] }));
  assert.equal(ui.run("nextStep().changes.view"), "architecture");
  assert.match(ui.run("architectureView()"), /当前基线待确认/);
  assert.doesNotMatch(ui.run("architectureView()"), /#focus=/);
});

test("empty states and snapshot refresh remain usable without fabricated tasks", async () => {
  const ui = await renderer();
  ui.load(snapshot({ features: [] }), { feature: "missing", view: "not-a-view" });
  assert.equal(ui.run("state.feature"), "");
  assert.equal(ui.run("state.view"), "overview");
  assert.equal(ui.run("nextStep().changes.view"), "spec");
  assert.match(ui.run("specView()"), /尚无规格记录/);
  assert.match(ui.run("taskList()"), /没有工单/);
  assert.doesNotMatch(ui.run("taskGraph()"), /<iframe|\/workflow\//);
  ui.run("graph = { ...graph, features:['demo'], tasks:[], errors:[{message:'<script>不可信诊断</script>'}] }; render()");
  assert.match(ui.app.innerHTML, /&lt;script&gt;不可信诊断&lt;\/script&gt;/);
  assert.doesNotMatch(ui.app.innerHTML, /<script>/);
  const next = snapshot({ tasks: [task()] });
  await ui.run(`fetch = async () => ({ok:true,json:async()=>(${JSON.stringify(next)})}); refresh()`);
  assert.equal(ui.run("counted().total"), 1);
  assert.match(ui.app.innerHTML, /SDD 开发流程/);
});

test("snapshot recovery clears its warning without masking a disconnected event stream", async () => {
  const ui = await renderer();
  ui.load(snapshot({ tasks: [task()] }));
  await ui.run(`fetch = async () => ({ok:true,json:async()=>graph})`);
  ui.emit("open");
  await ui.run("refresh()");
  assert.match(ui.app.innerHTML, /class="connection live"/);

  await ui.run("fetch = async () => { throw Error('snapshot'); }; refresh()");
  assert.match(ui.app.innerHTML, /快照读取失败，显示上次结果/);
  assert.doesNotMatch(ui.app.innerHTML, /连接中断，重连中|class="connection live"/);
  await ui.run("fetch = async () => ({ok:true,json:async()=>graph}); refresh()");
  assert.match(ui.app.innerHTML, /class="connection live"/);
  assert.doesNotMatch(ui.app.innerHTML, /快照读取失败|连接中断/);

  ui.emit("error");
  await ui.run("refresh()");
  assert.match(ui.app.innerHTML, /连接中断，重连中/);
  assert.doesNotMatch(ui.app.innerHTML, /class="connection live"/);
  ui.emit("open");
  await ui.run("refresh()");
  assert.match(ui.app.innerHTML, /class="connection live"/);
  assert.doesNotMatch(ui.app.innerHTML, /快照读取失败|连接中断/);
});
