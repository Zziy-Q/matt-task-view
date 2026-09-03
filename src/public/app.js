const app = document.querySelector("#app");
const collapsedGraphFeatures = new Set();
const collapsedTaskFeatures = new Set();
const labels = { done: "已完成", in_progress: "进行中", ready: "待开始", blocked: "受阻" };
const criterionPresentations = {
  accepted: { icon: "☑", label: "验收完成" },
  implemented: { icon: "▲", label: "已开发，待验收" },
  pending: { icon: "○", label: "未开发" },
};
const architectureStatusLabels = {
  approved: "已批准",
  not_required: "无需架构设计",
  pending_approval: "待人工批准",
  actual_pending_review: "实际架构待复核",
  baseline_pending: "长期基线待提升",
  baseline_verified: "长期基线已验证",
  current_baseline_required: "当前基线待确认",
  source_changed: "批准修订已过期",
  artifact_tampered: "展示工件不可验证",
  missing: "架构资料缺失",
  unverified: "架构尚未验证",
};
const lifecycleLabels = {
  absent: "不存在",
  recovery_required: "待恢复并确认",
  unknown: "尚未确认",
  missing: "尚未记录",
  pending_review: "待用户复核",
  approved: "已批准",
  verified: "已验证",
  foreign_feature: "来自其他功能",
  not_applicable: "不适用",
  confirmed: "已确认",
  from_other_feature: "来自其他功能",
};
const knownPlanningStatuses = new Set(["approved", "not_required", "pending_approval", "source_changed", "artifact_tampered", "missing", "unverified"]);
const knownWorkflowStatuses = new Set([
  ...knownPlanningStatuses,
  "actual_pending_review",
  "baseline_pending",
  "baseline_verified",
  "current_baseline_required",
]);

function architectureStateKnown(architecture) {
  const target = architecture?.lifecycle?.target ?? architecture?.status;
  const workflowStatus = architecture?.workflowStatus ?? architecture?.status;
  return knownPlanningStatuses.has(architecture?.status)
    && knownPlanningStatuses.has(target)
    && knownWorkflowStatuses.has(workflowStatus);
}

function architectureBlocksDevelopment(architecture) {
  return architecture?.developmentGatePassed === false || !architectureStateKnown(architecture);
}
let selectedFeature = "all";
let selectedTaskStatus = "all";

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const escapeSvg = escapeHtml;
const chevron = '<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4-4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>';
const stageIcons = {
  spec: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 2.75h6l3 3v11.5H5.5zM11.5 2.75v3h3M7.5 9h5M7.5 12h5M7.5 15h3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  architecture: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="3" width="5.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="11.75" y="3" width="5.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7.25" y="12.5" width="5.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7.5v2h9v-2M10 9.5v3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"/></svg>',
  plan: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="3.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m6.5 8 1.2 1.2L10 6.8M11.5 8h2M6.5 12l1.2 1.2 2.3-2.4M11.5 12h2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  implementation: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m7.5 8-2 2 2 2M12.5 8l2 2-2 2M11 6.5 9 13.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
  verification: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.75 15.5 5v4.2c0 3.5-2.2 6.15-5.5 8.05-3.3-1.9-5.5-4.55-5.5-8.05V5zM7.5 10l1.7 1.7 3.5-3.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"/></svg>',
};

function visibleTasks(graph) {
  return selectedFeature === "all" ? graph.tasks : graph.tasks.filter((task) => task.feature === selectedFeature);
}

function summarize(tasks) {
  const counts = Object.fromEntries(Object.keys(labels).map((status) => [status, tasks.filter((task) => task.status === status).length]));
  return { total: tasks.length, done: counts.done, progressPercent: tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0, ...counts };
}

function displayPath(path) {
  const index = path.indexOf("/.scratch/");
  return index === -1 ? path : path.slice(index + 1);
}

function shortText(value, max = 140) {
  const text = String(value || "").replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function criteriaList(criteria, className) {
  if (!criteria.length) return "";
  return `<ul class="${className}">${criteria.map((criterion) => {
    const state = criterionPresentations[criterion.state] ? criterion.state : "pending";
    const presentation = criterionPresentations[state];
    return `<li class="${state}" aria-label="${presentation.label}：${escapeHtml(criterion.text)}"><span class="criterion-check" aria-hidden="true">${presentation.icon}</span>${escapeHtml(criterion.text)}</li>`;
  }).join("")}</ul>`;
}

function progressPanel(summary) {
  const total = Math.max(summary.total, 1);
  const segments = ["done", "in_progress", "ready", "blocked"];
  let offset = 0;
  const bars = segments.map((status) => {
    const width = (summary[status] / total) * 100;
    const bar = width ? `<rect class="segment-${status}" x="${offset}" y="0" width="${width}" height="8"/>` : "";
    offset += width;
    return bar;
  }).join("");
  return `<h2 class="section-title">进度</h2><div class="progress-overview"><div class="overall-progress"><svg class="progress-ring" viewBox="0 0 44 44" role="img" aria-label="总体进度 ${summary.progressPercent}%"><circle class="ring-track" cx="22" cy="22" r="17"/><circle class="ring-value" cx="22" cy="22" r="17" pathLength="100" stroke-dasharray="${summary.progressPercent} ${100 - summary.progressPercent}" transform="rotate(-90 22 22)"/></svg><div><strong>${summary.progressPercent}%</strong><span>总体进度</span></div></div><div class="progress-metric done"><span>已完成</span><strong>${summary.done} / ${summary.total}</strong></div><div class="progress-metric in_progress"><span>进行中</span><strong>${summary.in_progress}</strong></div><div class="progress-metric ready"><span>待开始</span><strong>${summary.ready}</strong></div><div class="progress-metric blocked"><span>已阻塞</span><strong>${summary.blocked}</strong></div></div><svg class="segmented-progress" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label="完成 ${summary.done}，进行中 ${summary.in_progress}，待开始 ${summary.ready}，已阻塞 ${summary.blocked}"><rect class="segment-track" x="0" y="0" width="100" height="8"/>${bars}</svg>`;
}

function renderGraph(graph, tasks) {
  if (!tasks.length) return "";
  const features = [...new Set(tasks.map((task) => task.feature))];
  return `<div class="feature-graphs">${features.map((feature, index) => {
    const featureTasks = tasks.filter((task) => task.feature === feature);
    const specs = graph.specs.filter((spec) => spec.feature === feature);
    const externalDependencies = featureTasks.flatMap((task) => task.dependsOn
      .filter((id) => !featureTasks.some((candidate) => candidate.id === id))
      .map((id) => `<li>${escapeHtml(task.id)} ← ${escapeHtml(id)}</li>`));
    const route = `/workflow/${encodeURIComponent(feature)}/artifact.html`;
    return `<details class="feature-graph"${collapsedGraphFeatures.has(feature) ? "" : " open"} data-feature="${escapeHtml(feature)}"><summary><span><strong>${escapeHtml(specs[0]?.title || feature)}</strong><small>${escapeHtml(feature)} · ${featureTasks.length} 项任务</small></span><span class="graph-toggle"><span class="when-open">收起</span><span class="when-closed">展开</span></span></summary><div class="workflow-preview"><span class="architecture-frame-label">ARCHIFY · 任务依赖</span><a class="architecture-frame-open" href="${route}?theme=light" target="_blank" rel="noopener noreferrer">展开大图 ↗</a><iframe title="${escapeHtml(feature)} 任务依赖图" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="${route}?embed=1&theme=light"></iframe></div><div class="workflow-tickets" aria-label="定位任务">${featureTasks.map((task) => `<button type="button" class="node-button" data-task="${escapeHtml(task.id)}" title="${escapeHtml(task.title)}">${escapeHtml(task.localId)} · ${escapeHtml(task.phase)}</button>`).join("")}</div>${externalDependencies.length ? `<div class="graph-external"><strong>跨功能依赖</strong><ul>${externalDependencies.join("")}</ul></div>` : ""}</details>`;
  }).join("")}</div>`;
}

function taskRows(tasks, includeCriteria = false) {
  if (!tasks.length) return '<p class="sdd-empty">此阶段暂无本地任务。</p>';
  return `<ul class="sdd-task-list">${tasks.map((task) => `<li><span class="sdd-marker ${task.status}" aria-hidden="true"></span><div><strong><span class="task-id">${escapeHtml(task.localId)}</span>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.phase)} · ${labels[task.status]}</small>${architectureActionNotice(task)}${includeCriteria ? criteriaList(task.acceptanceCriteria, "sdd-criteria") : ""}${task.blockedReason ? `<p class="sdd-blocked">受阻：${escapeHtml(task.blockedReason)}</p>` : ""}${architectureDiagnosticList(task)}</div></li>`).join("")}</ul>`;
}

function architectureForTask(graph, task) {
  return (graph?.architectures || []).find((architecture) => architecture.feature === task.feature);
}

function componentFocusAllowed(task, architecture) {
  const target = architecture?.lifecycle?.target;
  const workflowStatus = architecture?.workflowStatus ?? architecture?.status;
  return architecture?.status === "approved"
    && target === "approved"
    && knownWorkflowStatuses.has(workflowStatus)
    && architecture.developmentGatePassed === true
    && architecture.artifactDisplayable === true
    && task.bindingStatus === "valid";
}

function taskAffectedComponents(task, architecture) {
  const affects = Array.isArray(task.affects) ? task.affects : [];
  if (!affects.length) return '<span class="architecture-affects-empty">尚未记录</span>';
  if (!componentFocusAllowed(task, architecture)) {
    return `<span class="architecture-affects-label">原组件 ID</span><span class="architecture-affects-values">${affects.map((id) => `<code>${escapeHtml(id)}</code>`).join(" ")}</span>`;
  }
  const components = new Map((task.affectedComponents || []).map((component) => [component.id, component]));
  const route = `/architecture/${encodeURIComponent(task.feature)}/artifact.html?theme=light`;
  return `<span class="architecture-affects-label">影响组件</span><span class="architecture-affects-values">${affects.map((id) => {
    const component = components.get(id);
    const label = component?.label || id;
    return `<a href="${escapeHtml(`${route}#focus=${encodeURIComponent(id)}`)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(id)}</small></a>`;
  }).join("")}</span>`;
}

function architectureBindingLabel(task) {
  return task.bindingStatus === "valid" ? "绑定有效"
    : task.bindingStatus === "unverifiable" ? "当前不可验证"
    : task.bindingStatus === "invalid" ? "绑定有误"
    : "尚未绑定";
}

function architectureDiagnosticList(task) {
  const diagnostics = Array.isArray(task.architectureDiagnostics) ? task.architectureDiagnostics : [];
  if (!diagnostics.length) return "";
  return `<ul class="architecture-diagnostics">${diagnostics.map((entry) => `<li>${escapeHtml(entry.message)}</li>`).join("")}</ul>`;
}

function architectureActionNotice(task) {
  return task.architectureAction?.message
    ? `<p class="architecture-warning"><strong>架构操作：</strong>${escapeHtml(task.architectureAction.message)}</p>`
    : "";
}

function hasArchitectureBinding(task) {
  return Boolean(task.architectureRevision
    || (Array.isArray(task.affects) && task.affects.length)
    || ["valid", "invalid", "unverifiable"].includes(task.bindingStatus)
    || task.architectureDiagnostics?.length);
}

function taskArchitectureDetail(task, graph) {
  if (!hasArchitectureBinding(task)) return "";
  const architecture = architectureForTask(graph, task);
  return `<dl class="task-architecture"><div><dt>架构修订</dt><dd><code>${escapeHtml(task.architectureRevision || "尚未记录")}</code></dd></div><div><dt>绑定状态</dt><dd>${escapeHtml(architectureBindingLabel(task))}</dd></div><div><dt>影响组件</dt><dd class="architecture-affects">${taskAffectedComponents(task, architecture)}</dd></div></dl>${architectureActionNotice(task)}${architectureDiagnosticList(task)}`;
}

function taskList(tasks, graph = {}) {
  const filtered = selectedTaskStatus === "all" ? tasks : tasks.filter((task) => task.status === selectedTaskStatus);
  if (!filtered.length) return '<li class="task-empty">此状态下没有本地任务。</li>';
  const features = [...new Set(filtered.map((task) => task.feature))];
  return features.map((feature) => {
    const featureTasks = filtered.filter((task) => task.feature === feature);
    const title = graph.specs?.find((spec) => spec.feature === feature)?.title || feature;
    const rows = featureTasks.map((task) => `<li><details data-task="${escapeHtml(task.id)}"><summary><span class="check ${task.status === "done" ? "done" : task.status}" aria-label="${labels[task.status]}">${task.status === "done" ? "✓" : ""}</span><span class="task-copy"><span class="task-title"><span class="task-id">${escapeHtml(task.localId)}</span>${escapeHtml(task.title)}</span><small class="task-meta">${escapeHtml(task.phase)}</small></span><span class="state ${task.status}">${labels[task.status]}</span></summary>${criteriaList(task.acceptanceCriteria, "criteria")}${task.blockedReason ? `<p class="blocked-reason">受阻原因：${escapeHtml(task.blockedReason)}</p>` : ""}${taskArchitectureDetail(task, graph)}<p class="source-path">票据：${escapeHtml(displayPath(task.path))}</p></details></li>`).join("");
    return `<li class="task-feature"><details class="task-feature-group"${collapsedTaskFeatures.has(feature) ? "" : " open"} data-feature="${escapeHtml(feature)}"><summary class="task-feature-summary"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(feature)} · ${featureTasks.length} 项任务</small></span><span class="graph-toggle"><span class="when-open">收起</span><span class="when-closed">展开</span></span></summary><ul class="task-feature-list">${rows}</ul></details></li>`;
  }).join("");
}

function taskTabs(tasks) {
  const tabs = [["all", "全部"], ["in_progress", "进行中"], ["ready", "待开始"], ["blocked", "已阻塞"], ["done", "已完成"]];
  return `<div class="task-tabs" role="tablist" aria-label="按状态筛选任务">${tabs.map(([status, label]) => `<button class="task-tab${selectedTaskStatus === status ? " active" : ""}" type="button" role="tab" aria-selected="${selectedTaskStatus === status}" data-status="${status}">${label}<span>${status === "all" ? tasks.length : tasks.filter((task) => task.status === status).length}</span></button>`).join("")}</div>`;
}

function specContent(specs) {
  if (!specs.length) return '<p class="sdd-empty">尚未找到此功能的 <code>spec.md</code>。</p>';
  const labels = { "Problem Statement": "目标", Solution: "方案", "User Stories": "用户故事", "Implementation Decisions": "实施决策", "Testing Decisions": "测试决策", "Out of Scope": "不在范围", "Further Notes": "补充说明" };
  return specs.map((spec) => {
    const sections = Object.entries(spec.sections);
    const summary = sections.map(([name, content]) => `<div><dt>${escapeHtml(labels[name] || name)}</dt><dd>${escapeHtml(shortText(content))}</dd></div>`).join("");
    const full = sections.map(([name, content]) => `<h4>${escapeHtml(labels[name] || name)}</h4><p>${escapeHtml(content)}</p>`).join("");
    return `<article class="spec-brief"><h3>${escapeHtml(spec.title)}</h3><p class="spec-path">来源：${escapeHtml(displayPath(spec.path))}</p><dl>${summary}</dl><details class="source-preview"><summary>查看完整规格${chevron}</summary><div>${full}</div></details></article>`;
  }).join("");
}

function selectedArchitectures(graph) {
  const architectures = Array.isArray(graph.architectures) ? graph.architectures : [];
  return selectedFeature === "all" ? architectures : architectures.filter((architecture) => architecture.feature === selectedFeature);
}

function architectureModeLabel(mode) {
  return mode === "greenfield" ? "绿地规划" : mode === "existing" ? "既有系统变更" : mode === "verification" ? "实际架构复核" : "尚未确认";
}

function architectureLifecycleLabel(value) {
  return lifecycleLabels[value] || architectureStatusLabels[value] || "尚未记录";
}

function architecturePresentation(architectures, tasks) {
  if (!architectures.length) return { state: "ready", label: "未记录", detail: "兼容无架构记录的旧功能", open: false };
  const unknown = architectures.find((architecture) => !architectureStateKnown(architecture));
  const gateFailed = architectures.find((architecture) => architecture.workflowStatus === "current_baseline_required");
  const failed = unknown || gateFailed || architectures.find((architecture) => ["source_changed", "artifact_tampered", "missing", "unverified"].includes(architecture.status));
  const pending = architectures.find((architecture) => architecture.status === "pending_approval");
  const workflowPending = architectures.find((architecture) => ["actual_pending_review", "baseline_pending"].includes(architecture.workflowStatus || architecture.status));
  const current = failed || pending || workflowPending || architectures[0];
  const displayStatus = unknown === current ? "unknown" : current.workflowStatus || current.status;
  const executionStarted = tasks.some((task) => architectures.some((architecture) => architecture.feature === task.feature)
    && ["in_progress", "done"].includes(task.status));
  return {
    state: failed ? "blocked" : pending || workflowPending ? "in_progress" : "done",
    label: displayStatus === "unknown" ? "未知架构状态（已锁定）" : architectureStatusLabels[displayStatus] || "待确认",
    detail: architectures.length === 1 ? current.nextStep : `${architectures.length} 个功能有架构记录`,
    open: Boolean(failed || pending || workflowPending || (architectures.some((architecture) => architecture.status === "approved") && !executionStarted)),
  };
}

function architectureHash(value) {
  return value || "尚未批准";
}

function architectureBindings(architecture, tasks) {
  const bound = tasks.filter((task) => task.feature === architecture.feature && hasArchitectureBinding(task));
  if (!bound.length) return '<p class="sdd-empty">尚无架构绑定工单。</p>';
  return `<ul class="architecture-bindings">${bound.map((task) => `<li><div class="architecture-binding-ticket"><strong><span class="task-id">${escapeHtml(task.localId)}</span>${escapeHtml(task.title)}</strong><span>${escapeHtml(architectureBindingLabel(task))}</span></div><div class="architecture-affects">${taskAffectedComponents(task, architecture)}</div>${architectureDiagnosticList(task)}</li>`).join("")}</ul>`;
}

function yesNo(value) {
  return value ? "是" : "否";
}

function architectureReviewContent(architecture) {
  if (!architecture.actual) return "";
  const kindLabels = { added: "新增", changed: "变更", removed: "移除" };
  const differences = architecture.actual.differences?.length
    ? `<ul class="architecture-diagnostics">${architecture.actual.differences.map((difference) => `<li><strong>${escapeHtml(kindLabels[difference.kind] || difference.kind)} · ${escapeHtml(difference.componentId)}</strong>：${escapeHtml(difference.summary)}；原因：${escapeHtml(difference.rationale)}</li>`).join("")}</ul>`
    : '<p class="sdd-empty">尚未记录规划与实际差异。</p>';
  const baseline = architecture.baseline?.status === "foreign_feature" || architecture.baseline?.status === "from_other_feature"
    ? `<p class="architecture-warning">当前项目基线来自 ${escapeHtml(architecture.baseline.sourceFeature || "其他功能")}；本功能尚未提升。</p>`
    : architecture.workflowStatus === "baseline_verified"
      ? '<p class="architecture-skip">长期基线已验证，且与批准的实际架构四件套精确一致。</p>'
      : architecture.workflowStatus === "baseline_pending"
        ? '<p class="architecture-warning">实际架构已批准，长期基线仍待外部流程精确提升。</p>'
        : "";
  return `<section class="architecture-section"><h4>实际架构复核</h4><dl class="architecture-compact-grid"><div><dt>实现完成</dt><dd>${yesNo(architecture.implementationComplete)}</dd></div><div><dt>交付核验</dt><dd>${yesNo(architecture.deliveryVerified)}</dd></div><div><dt>工具校验</dt><dd>${yesNo(architecture.toolValidationPassed)}</dd></div><div><dt>用户批准</dt><dd>${yesNo(architecture.userApproved)}</dd></div></dl><p>${escapeHtml(architecture.actual.reason || "尚未记录总体复核说明")}</p>${differences}${baseline}</section>`;
}

function architectureContent(architectures, tasks = []) {
  if (!architectures.length) return '<p class="sdd-empty">此旧功能没有架构记录；兼容展示且不据此推断架构已批准。</p>';
  if (architectures.length > 1) {
    return `<p class="sdd-empty">请选择一个功能查看可信架构概览；全部功能视图不会同时加载多张大图。</p><ul class="architecture-feature-list">${architectures.map((architecture) => `<li><strong>${escapeHtml(architecture.feature)}</strong><span>${escapeHtml(architectureStatusLabels[architecture.workflowStatus || architecture.status] || "待确认")}</span></li>`).join("")}</ul>`;
  }

  const architecture = architectures[0];
  const route = `/architecture/${encodeURIComponent(architecture.feature)}/artifact.html`;
  const components = architecture.components?.length
    ? `<ul class="architecture-components">${architecture.components.map((component) => `<li><strong>${escapeHtml(component.label)}</strong><span>${escapeHtml(component.id)}</span></li>`).join("")}</ul>`
    : '<p class="sdd-empty">尚未记录受影响组件。</p>';
  const componentsHeading = architecture.status === "source_changed" ? "当前未批准架构组件" : "受影响组件";
  const componentsNotice = architecture.status === "source_changed"
    ? '<p class="architecture-warning">这些组件来自当前已修改的架构源，不属于下面的最后可信交付图；重新交付并批准前不会用于工单绑定。</p>'
    : "";
  const staleNotice = architecture.status === "source_changed"
    ? '<p class="architecture-warning"><strong>最后可信交付图：</strong>当前架构源已经变化，下面的图只代表回执仍完整的上一版。</p>'
    : "";
  const artifact = architecture.status === "not_required"
    ? '<p class="architecture-skip">已记录无架构影响理由，本次不需要生成架构展示工件。</p>'
    : architecture.artifactDisplayable
    ? `${staleNotice}<div class="architecture-frame-shell"><span class="architecture-frame-label">ARCHIFY · 架构概览</span><a class="architecture-frame-open" href="${escapeHtml(`${route}?theme=light`)}" target="_blank" rel="noopener noreferrer">展开大图 ↗</a><iframe title="Archify 架构图概览" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="${escapeHtml(`${route}?embed=1&theme=light`)}"></iframe><span class="architecture-frame-overview">窄面板只显示架构概览；节点阅读请展开大图。</span></div>`
    : '<p class="architecture-warning"><strong>架构图不可展示：</strong>缺少可信回执或展示工件校验失败。</p>';
  const codeEvidence = architecture.mode === "greenfield" ? "暂无代码（规划阶段）" : "尚未记录可验证代码证据";
  return `<div class="architecture-next-action"><span aria-hidden="true">→</span><p><strong>下一步</strong>${escapeHtml(architecture.nextStep)}</p></div><dl class="architecture-compact-grid"><div><dt>设计类型</dt><dd>${escapeHtml(architectureModeLabel(architecture.mode))}</dd></div><div><dt>架构变化</dt><dd>${escapeHtml(architecture.reason || "尚未记录")}</dd></div><div><dt>代码证据</dt><dd>${escapeHtml(codeEvidence)}</dd></div></dl><section class="architecture-section"><h4>生命周期</h4><dl class="architecture-lifecycle"><div><dt>当前架构</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.current))}</dd></div><div><dt>目标架构</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.target))}</dd></div><div><dt>实际架构</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.actual))}</dd></div><div><dt>长期基线</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.baseline))}</dd></div></dl></section>${artifact}${architectureReviewContent(architecture)}<section class="architecture-section"><h4>修订绑定</h4><dl class="architecture-revisions"><div><dt>当前架构摘要</dt><dd><code>${escapeHtml(architectureHash(architecture.hashes?.currentSpecification))}</code></dd></div><div><dt>交付回执摘要</dt><dd><code>${escapeHtml(architectureHash(architecture.hashes?.receiptSpecification))}</code></dd></div><div><dt>批准修订</dt><dd><code>${escapeHtml(architectureHash(architecture.hashes?.approvedSpecification))}</code></dd></div></dl></section><section class="architecture-section"><h4>${componentsHeading}</h4>${componentsNotice}${components}</section><section class="architecture-section"><h4>绑定工单</h4>${architectureBindings(architecture, tasks)}</section>`;
}

function sddCard(name, state, label, detail, content, open = false, icon = "spec", className = "") {
  return `<details class="sdd-card ${state}${className ? ` ${className}` : ""}"${open ? " open" : ""}><summary><span class="sdd-stage-icon" aria-hidden="true">${stageIcons[icon]}</span><span class="sdd-state-icon" aria-hidden="true">${state === "done" ? "✓" : ""}</span><span class="sdd-summary-copy"><strong>${name}</strong><small>${escapeHtml(detail)}</small></span><span class="sdd-state-label">${label}</span>${chevron}</summary><div class="sdd-content">${content}</div></details>`;
}

function sddFlow(graph, tasks, summary) {
  const active = tasks.filter((task) => task.status === "in_progress");
  const blocked = tasks.filter((task) => task.status === "blocked");
  const ready = tasks.filter((task) => graph.frontier.includes(task.id));
  const allDone = summary.total > 0 && summary.done === summary.total;
  const specs = graph.specs.filter((spec) => selectedFeature === "all" || spec.feature === selectedFeature);
  const architectures = selectedArchitectures(graph);
  const architecture = architecturePresentation(architectures, tasks);
  const blockedArchitectures = architectures.filter(architectureBlocksDevelopment);
  const architectureBlocked = blockedArchitectures.length > 0;
  const bindingProblems = architectureBlocked ? [] : tasks.filter((task) => ["invalid", "unverifiable"].includes(task.bindingStatus)
    || task.architectureDiagnostics?.length);
  const architectureReview = architectures.find((entry) => ["actual_pending_review", "baseline_pending"].includes(entry.workflowStatus || entry.status));
  const implementation = graph.errors.length ? ["blocked", "需修正", "计划诊断发现问题"]
    : bindingProblems.length ? ["blocked", "架构绑定需修正", `${bindingProblems.length} 项工单绑定有误`]
    : active.length ? ["in_progress", "进行中", `当前：${active.map((task) => task.localId).join("、")}`]
    : blocked.length ? ["blocked", "受阻", `${blocked.length} 项任务受阻`]
    : allDone ? ["done", `完成 ${summary.done} / ${summary.total}`, "任务实现已完成"]
    : ["ready", "待开始", ready.length ? `可开始：${ready.map((task) => task.localId).join("、")}` : "等待可执行任务"];
  const nextAction = graph.errors.length ? "先修正任务图中的诊断问题。"
    : architectureBlocked ? (architectures.length === 1 ? architectures[0].nextStep : `先处理 ${blockedArchitectures.length} 个功能的架构门禁。`)
    : bindingProblems.length ? `先修正 ${bindingProblems.map((task) => task.localId).join("、")} 的架构绑定诊断。`
    : architectureReview ? architectureReview.nextStep
    : active.length ? `继续完成 ${active.map((task) => task.localId).join("、")} 的验收项。`
    : blocked.length ? "先处理受阻原因，再恢复任务前沿。"
    : allDone ? "记录测试、评审或发布回读，完成验证与交付。"
    : ready.length ? `可开始 ${ready.map((task) => task.localId).join("、")}。`
    : "等待规格和任务拆分完成。";
  const graphContent = `<dl class="execution-facts"><div><dt>任务</dt><dd>${summary.total} 项</dd></div><div><dt>可执行</dt><dd>${ready.length} 项</dd></div><div><dt>受阻</dt><dd>${summary.blocked} 项</dd></div></dl>${graph.errors.length ? '<p class="sdd-blocked">任务图存在诊断问题，无法确认可执行性。</p>' : architectureBlocked ? '<p class="sdd-blocked">等待架构门禁通过；任务依赖保持有效，但尚不可开始新的实现。</p>' : bindingProblems.length ? '<p class="sdd-blocked">工单架构绑定存在诊断，修正前不能确认计划可执行。</p>' : '<p class="sdd-empty">依赖已校验；前置任务完成后，票据才会进入可执行前沿。</p>'}${taskRows(tasks)}`;
  const verificationContent = allDone ? '<p class="verification-notice">所有票据均已标记完成；本地尚未记录测试、评审或发布验证证据。</p>' : '<p class="sdd-empty">实施完成后，在这里核对测试、评审与交付证据。</p>';
  const planState = graph.errors.length ? ["blocked", "需修正", "发现任务图诊断"]
    : architectureBlocked ? ["blocked", "等待架构门禁", "架构批准后才能开始任务"]
    : bindingProblems.length ? ["blocked", "绑定需修正", `${bindingProblems.length} 项工单存在架构诊断`]
    : tasks.length ? ["done", "已完成", `${summary.total} 项任务 · ${ready.length} 项可开始`]
    : ["ready", "待拆分", "等待本地任务"];
  return `<section class="section sdd"><h2 class="section-title">SDD 开发流程</h2><p class="sdd-focus ${architectureBlocked ? "blocked" : architectureReview ? "in_progress" : implementation[0]}"><strong>下一步：</strong>${escapeHtml(nextAction)}</p><div class="sdd-cards">${sddCard("规格与边界", specs.length ? "done" : "ready", specs.length ? "已完成" : "待生成", specs.length ? `${specs.length} 份本地规格` : "等待 spec.md", specContent(specs), false, "spec")}${sddCard("架构设计", architecture.state, architecture.label, architecture.detail, architectureContent(architectures, tasks), architecture.open, "architecture", "architecture-card")}${sddCard("任务计划", planState[0], planState[1], planState[2], graphContent, false, "plan")}${sddCard("实施明细", implementation[0], implementation[1], implementation[2], taskRows(tasks, true), active.length > 0, "implementation")}${sddCard("验证与交付", allDone ? "ready" : "waiting", allDone ? "待记录" : "等待实施", allDone ? "实现完成，尚未记录验证证据" : "实施完成后开启", verificationContent, false, "verification")}</div></section>`;
}

function render(graph) {
  if (!graph.features.includes(selectedFeature)) selectedFeature = "all";
  const tasks = visibleTasks(graph);
  const summary = summarize(tasks);
  const frontier = graph.frontier.filter((id) => tasks.some((task) => task.id === id));
  app.innerHTML = `<div class="shell"><header class="header"><h1>开发任务视图</h1><select id="feature-filter" aria-label="选择工作范围"><option value="all">全部功能</option>${graph.features.map((feature) => `<option value="${escapeHtml(feature)}" ${selectedFeature === feature ? "selected" : ""}>${escapeHtml(feature)}</option>`).join("")}</select></header><section class="section progress-section"><h2 class="section-title">进度</h2><div class="progress-line"><div class="progress-count">${summary.done}<span> / ${summary.total}</span></div><strong class="progress-percent">${summary.progressPercent}%</strong></div><progress value="${summary.done}" max="${Math.max(summary.total, 1)}">${summary.progressPercent}%</progress><div class="stat-grid"><div class="stat"><strong>${summary.total}</strong><span>总任务</span></div><div class="stat"><strong class="done">${summary.done}</strong><span>已完成</span></div><div class="stat"><strong class="in_progress">${summary.in_progress}</strong><span>进行中</span></div><div class="stat"><strong class="ready">${summary.ready}</strong><span>待开始</span></div></div></section>${sddFlow(graph, tasks, summary)}${graph.errors.length ? `<section class="error"><strong>计划需要修正</strong><ul>${graph.errors.map((error) => `<li>${escapeHtml(error.message)}<br><small>${escapeHtml(displayPath(error.path))}</small></li>`).join("")}</ul></section>` : ""}<section class="section"><h2 class="section-title">依赖流程图</h2>${tasks.length ? renderGraph(graph, tasks) : '<p class="empty">还没有可视化的本地任务。</p>'}${frontier.length ? `<p class="frontier"><strong>可开始：</strong>${frontier.map(escapeHtml).join("、")}</p>` : ""}</section><section><h2 class="section-title section">任务列表</h2><ul class="task-list">${taskList(tasks, graph)}</ul></section><p class="updated">基于本地 Markdown 规格与任务图 · 自动刷新</p></div>`;
  app.querySelector(".progress-section").innerHTML = progressPanel(summary);
  app.querySelector(".task-list").insertAdjacentHTML("beforebegin", taskTabs(tasks));
  app.querySelectorAll(".feature-graph").forEach((detail) => detail.addEventListener("toggle", () => {
    if (!detail.isConnected) return;
    if (detail.open) collapsedGraphFeatures.delete(detail.dataset.feature);
    else collapsedGraphFeatures.add(detail.dataset.feature);
  }));
  app.querySelectorAll(".task-feature-group").forEach((detail) => detail.addEventListener("toggle", () => {
    if (!detail.isConnected) return;
    if (detail.open) collapsedTaskFeatures.delete(detail.dataset.feature);
    else collapsedTaskFeatures.add(detail.dataset.feature);
  }));
  app.querySelector("#feature-filter")?.addEventListener("change", (event) => { selectedFeature = event.target.value; selectedTaskStatus = "all"; render(graph); });
  app.querySelectorAll(".task-tab").forEach((tab) => tab.addEventListener("click", () => { selectedTaskStatus = tab.dataset.status; render(graph); }));
  bindTaskNodes(app, graph);
}

function bindTaskNodes(container, graph) {
  container.querySelectorAll(".node-button").forEach((node) => {
    const openTicket = () => {
      selectedTaskStatus = "all";
      collapsedTaskFeatures.delete(graph.tasks.find((task) => task.id === node.dataset.task)?.feature);
      render(graph);
      const ticket = [...app.querySelectorAll("details")].find((detail) => detail.dataset.task === node.dataset.task);
      if (ticket) { ticket.open = true; ticket.scrollIntoView({ behavior: "smooth", block: "center" }); }
    };
    node.addEventListener("click", openTicket);
    if (node.tagName !== "BUTTON") node.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openTicket(); } });
  });
}

async function refresh() {
  try { render(await (await fetch("/api/snapshot", { cache: "no-store" })).json()); } catch { app.textContent = "无法读取本地任务快照。"; }
}

refresh();
new EventSource("/events").addEventListener("refresh", refresh);
