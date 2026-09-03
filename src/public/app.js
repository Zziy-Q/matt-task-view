const app = document.querySelector("#app");
const expandedGraphFeatures = new Set();
let historyOpen = false;
let followCurrentFeature = true;
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
  return `<div class="feature-graphs">${features.map((feature) => {
    const featureTasks = tasks.filter((task) => task.feature === feature);
    const external = featureTasks.flatMap((task) => task.dependsOn
      .filter((id) => !featureTasks.some((candidate) => candidate.id === id))
      .map((id) => `<li>${escapeHtml(task.id)} ← ${escapeHtml(id)}</li>`));
    const route = `/workflow/${encodeURIComponent(feature)}/artifact.html`;
    const open = expandedGraphFeatures.has(feature);
    return `<details class="feature-graph"${open ? " open" : ""} data-feature="${escapeHtml(feature)}"><summary><span><strong>查看依赖关系</strong><small>${escapeHtml(feature)} · ${featureTasks.length} 项工单</small></span><span class="graph-toggle"><span class="when-open">收起</span><span class="when-closed">展开</span></span></summary><p class="workflow-note">箭头表示工单的前置依赖。概览最多显示 12 项、6 层，完整工单见上方列表。</p><div class="workflow-preview"><span class="architecture-frame-label">工单依赖</span><a class="architecture-frame-open" href="${route}?theme=light" target="_blank" rel="noopener noreferrer">展开大图 ↗</a><iframe title="${escapeHtml(feature)} 工单依赖图" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" data-src="${route}?embed=1&theme=light"${open ? ` src="${route}?embed=1&theme=light"` : ""}></iframe></div>${external.length ? `<div class="graph-external"><strong>跨功能依赖</strong><ul>${external.join("")}</ul></div>` : ""}</details>`;
  }).join("")}</div>`;
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

function taskExecutionHint(task, graph) {
  if (task.architectureAction?.message) return task.architectureAction.message;
  if (task.status === "in_progress") return "当前任务";
  if (task.status === "blocked") return `受阻：${task.blockedReason || "请查看工单"}`;
  if (task.status === "done") return task.phase;
  if (graph.frontier?.includes(task.id)) return "可开始";
  if (["invalid", "unverifiable"].includes(task.bindingStatus)) return "等待修正架构绑定";
  const waiting = task.dependsOn.filter((id) => !graph.tasks?.some((entry) => entry.id === id && entry.status === "done"));
  return waiting.length ? `等待前置：${waiting.join("、")}` : "等待计划校验或架构门禁";
}

function taskList(tasks, graph = {}) {
  const filtered = (selectedTaskStatus === "all" ? [...tasks] : tasks.filter((task) => task.status === selectedTaskStatus));
  const priority = (task) => task.status === "in_progress" ? 0 : task.status === "blocked" ? 1 : graph.frontier?.includes(task.id) ? 2 : task.status === "ready" ? 3 : 4;
  filtered.sort((a, b) => priority(a) - priority(b));
  if (!filtered.length) return '<li class="task-empty">此状态下没有本地任务。</li>';
  const features = [...new Set(filtered.map((task) => task.feature))];
  return features.map((feature) => {
    const featureTasks = filtered.filter((task) => task.feature === feature);
    const title = graph.specs?.find((spec) => spec.feature === feature)?.title || feature;
    const rows = featureTasks.map((task) => `<li><details data-task="${escapeHtml(task.id)}"><summary><span class="check ${task.status === "done" ? "done" : task.status}" aria-label="${labels[task.status]}">${task.status === "done" ? "✓" : ""}</span><span class="task-copy"><span class="task-title"><span class="task-id">${escapeHtml(task.localId)}</span>${escapeHtml(task.title)}</span><small class="task-meta">${escapeHtml(taskExecutionHint(task, graph))}</small></span><span class="state ${task.status}">${labels[task.status]}</span></summary>${criteriaList(task.acceptanceCriteria, "criteria")}${task.blockedReason ? `<p class="blocked-reason">受阻原因：${escapeHtml(task.blockedReason)}</p>` : ""}${taskArchitectureDetail(task, graph)}<p class="source-path">票据：${escapeHtml(displayPath(task.path))}</p></details></li>`).join("");
    if (features.length === 1) return rows;
    return `<li class="task-feature"><details class="task-feature-group"${collapsedTaskFeatures.has(feature) ? "" : " open"} data-feature="${escapeHtml(feature)}"><summary class="task-feature-summary"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(feature)} · ${featureTasks.length} 项任务</small></span><span class="graph-toggle"><span class="when-open">收起</span><span class="when-closed">展开</span></span></summary><ul class="task-feature-list">${rows}</ul></details></li>`;
  }).join("");
}

function taskTabs(tasks) {
  const tabs = [["all", "全部"], ["in_progress", "进行中"], ["ready", "待开始"], ["blocked", "已阻塞"], ["done", "已完成"]];
  return `<div class="task-tabs" role="tablist" aria-label="按状态筛选任务">${tabs.map(([status, label]) => `<button class="task-tab${selectedTaskStatus === status ? " active" : ""}" type="button" role="tab" aria-selected="${selectedTaskStatus === status}" data-status="${status}">${label}<span>${status === "all" ? tasks.length : tasks.filter((task) => task.status === status).length}</span></button>`).join("")}</div>`;
}

function specContent(specs, tasks = []) {
  if (!specs.length) return '<p class="sdd-empty">尚未找到此功能的 <code>spec.md</code>。</p>';
  return specs.map((spec) => {
    const sections = Object.entries(spec.sections);
    const pick = (names) => names.map((name) => spec.sections[name]).find(Boolean);
    const goal = pick(["目标", "Goal", "Problem Statement", "背景"]);
    const scope = pick(["范围", "边界", "Scope", "Out of Scope", "不在范围"]);
    const acceptance = pick(["验收标准", "验收", "Acceptance Criteria"]);
    const criteria = tasks.filter((task) => task.feature === spec.feature).flatMap((task) => task.acceptanceCriteria || []);
    const summary = `<div><dt>目标</dt><dd>${escapeHtml(goal ? shortText(goal.split(/\n\s*\n/u)[0], 110) : "规格未单独记录目标，请查看完整规格。")}</dd></div><div><dt>${(spec.sections["Out of Scope"] || spec.sections["不在范围"]) && !pick(["范围", "边界", "Scope"]) ? "不在范围" : "范围"}</dt><dd>${escapeHtml(scope ? shortText(scope, 110) : "规格未单独记录范围，请查看完整规格。")}</dd></div><div><dt>验收标准</dt><dd>${acceptance ? escapeHtml(shortText(acceptance, 110)) : criteria.length ? `<ul>${criteria.slice(0, 3).map((item) => `<li>${escapeHtml(shortText(item.text, 85))}</li>`).join("")}</ul><small>共 ${criteria.length} 项，完整标准见工单。</small>` : "规格未单独记录验收标准，请查看工单验收项。"}</dd></div>`;
    const full = sections.map(([name, content]) => `<h4>${escapeHtml(name)}</h4><p>${escapeHtml(content)}</p>`).join("");
    return `<article class="spec-brief"><dl>${summary}</dl><details class="source-preview"><summary>查看完整规格${chevron}</summary><div><h3>${escapeHtml(spec.title)}</h3><p class="spec-path">来源：${escapeHtml(displayPath(spec.path))}</p>${full}</div></details></article>`;
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

function architecturePreview(architecture) {
  const route = `/architecture/${encodeURIComponent(architecture.feature)}/artifact.html`;
  const staleNotice = architecture.status === "source_changed"
    ? '<p class="architecture-warning"><strong>最后可信交付图：</strong>当前架构源已经变化，下面的图只代表回执仍完整的上一版。</p>'
    : "";
  return architecture.status === "not_required"
    ? '<p class="architecture-skip">已记录无架构影响理由，本次不需要生成架构展示工件。</p>'
    : architecture.artifactDisplayable
    ? `${staleNotice}<div class="architecture-frame-shell"><span class="architecture-frame-label">ARCHIFY · 架构概览</span><a class="architecture-frame-open" href="${escapeHtml(`${route}?theme=light`)}" target="_blank" rel="noopener noreferrer">展开大图 ↗</a><iframe title="Archify 架构图概览" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="${escapeHtml(`${route}?embed=1&theme=light`)}"></iframe><span class="architecture-frame-overview">窄面板只显示架构概览；节点阅读请展开大图。</span></div>`
    : '<p class="architecture-warning"><strong>架构图不可展示：</strong>缺少可信回执或展示工件校验失败。</p>';
}

function architectureContent(architectures, tasks = []) {
  if (!architectures.length) return '<p class="sdd-empty">此旧功能没有架构记录；兼容展示且不据此推断架构已批准。</p>';
  if (architectures.length > 1) {
    return `<p class="sdd-empty">请选择一个功能查看可信架构概览；全部功能视图不会同时加载多张大图。</p><ul class="architecture-feature-list">${architectures.map((architecture) => `<li><strong>${escapeHtml(architecture.feature)}</strong><span>${escapeHtml(architectureStatusLabels[architecture.workflowStatus || architecture.status] || "待确认")}</span></li>`).join("")}</ul>`;
  }

  const architecture = architectures[0];
  const components = architecture.components?.length
    ? `<ul class="architecture-components">${architecture.components.map((component) => `<li><strong>${escapeHtml(component.label)}</strong><span>${escapeHtml(component.id)}</span></li>`).join("")}</ul>`
    : '<p class="sdd-empty">尚未记录受影响组件。</p>';
  const componentsHeading = architecture.status === "source_changed" ? "当前未批准架构组件" : "受影响组件";
  const componentsNotice = architecture.status === "source_changed"
    ? '<p class="architecture-warning">这些组件来自当前已修改的架构源，不属于下面的最后可信交付图；重新交付并批准前不会用于工单绑定。</p>'
    : "";
  const codeEvidence = architecture.mode === "greenfield" ? "暂无代码（规划阶段）" : "尚未记录可验证代码证据";
  return `<div class="architecture-next-action"><span aria-hidden="true">→</span><p><strong>下一步</strong>${escapeHtml(architecture.nextStep)}</p></div><dl class="architecture-compact-grid"><div><dt>设计类型</dt><dd>${escapeHtml(architectureModeLabel(architecture.mode))}</dd></div><div><dt>架构变化</dt><dd>${escapeHtml(architecture.reason || "尚未记录")}</dd></div><div><dt>代码证据</dt><dd>${escapeHtml(codeEvidence)}</dd></div></dl><section class="architecture-section"><h4>生命周期</h4><dl class="architecture-lifecycle"><div><dt>当前架构</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.current))}</dd></div><div><dt>目标架构</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.target))}</dd></div><div><dt>实际架构</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.actual))}</dd></div><div><dt>长期基线</dt><dd>${escapeHtml(architectureLifecycleLabel(architecture.lifecycle?.baseline))}</dd></div></dl></section>${architecturePreview(architecture)}${architectureReviewContent(architecture)}<section class="architecture-section"><h4>修订绑定</h4><dl class="architecture-revisions"><div><dt>当前架构摘要</dt><dd><code>${escapeHtml(architectureHash(architecture.hashes?.currentSpecification))}</code></dd></div><div><dt>交付回执摘要</dt><dd><code>${escapeHtml(architectureHash(architecture.hashes?.receiptSpecification))}</code></dd></div><div><dt>批准修订</dt><dd><code>${escapeHtml(architectureHash(architecture.hashes?.approvedSpecification))}</code></dd></div></dl></section><section class="architecture-section"><h4>${componentsHeading}</h4>${componentsNotice}${components}</section><section class="architecture-section"><h4>绑定工单</h4>${architectureBindings(architecture, tasks)}</section>`;
}

function sddCard(name, state, label, detail, content, open = false, icon = "spec", className = "") {
  return `<details class="sdd-card ${state}${className ? ` ${className}` : ""}"${open ? " open" : ""}><summary><span class="sdd-stage-icon" aria-hidden="true">${stageIcons[icon]}</span><span class="sdd-state-icon" aria-hidden="true">${state === "done" ? "✓" : ""}</span><span class="sdd-summary-copy"><strong>${name}</strong><small>${escapeHtml(detail)}</small></span><span class="sdd-state-label">${label}</span>${chevron}</summary><div class="sdd-content">${content}</div></details>`;
}

function sddFlow(graph, tasks, summary, taskContent = "") {
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
  const executionState = graph.errors.length || bindingProblems.length ? "blocked" : active.length ? "in_progress" : blocked.length ? "blocked" : allDone ? "done" : "ready";
  const nextAction = graph.errors.length ? "先修正任务图中的诊断问题。"
    : architectureBlocked ? (active.find((task) => task.architectureAction?.message)?.architectureAction.message || (architectures.length === 1 ? architectures[0].nextStep : `先处理 ${blockedArchitectures.length} 个功能的架构门禁。`))
    : bindingProblems.length ? `先修正 ${bindingProblems.map((task) => task.localId).join("、")} 的架构绑定诊断。`
    : architectureReview ? architectureReview.nextStep
    : active.length ? `继续完成 ${active.map((task) => task.localId).join("、")} 的验收项。`
    : blocked.length ? "先处理受阻原因，再恢复任务前沿。"
    : allDone ? "记录测试、评审或发布回读，完成验证与交付。"
    : ready.length ? `可开始 ${ready.map((task) => task.localId).join("、")}。`
    : "等待规格和任务拆分完成。";
  const verificationContent = allDone ? '<p class="verification-notice">所有票据均已标记完成；本地尚未记录测试、评审或发布验证证据。</p>' : '<p class="sdd-empty">实施完成后，在这里核对测试、评审与交付证据。</p>';
  return `<section class="section sdd"><h2 class="section-title">执行概况</h2><p class="sdd-focus ${architectureBlocked ? "blocked" : architectureReview ? "in_progress" : executionState}"><strong>下一步：</strong>${escapeHtml(nextAction)}</p>${taskContent}<h2 class="section-title context-title">设计与验收依据</h2><div class="sdd-cards">${sddCard("规格与边界", specs.length ? "done" : "ready", specs.length ? "已记录" : "待生成", "目标、范围与验收标准", specContent(specs, tasks), false, "spec")}${architectures.length ? sddCard("架构设计", architecture.state, architecture.label, architecture.detail, architectureContent(architectures, tasks), architecture.open, "architecture", "architecture-card") : ""}${sddCard("验证与交付", allDone ? "ready" : "waiting", allDone ? "待记录" : "等待实施", allDone ? "工单已完成，交付证据需独立核对" : "实施完成后核对证据", verificationContent, false, "verification")}</div></section>`;
}

function featureHasErrors(graph, feature) {
  return graph.errors.some((error) => !error.path || error.path.replaceAll("\\", "/").includes(`/.scratch/${feature}/`));
}

function featureIsHistory(graph, feature) {
  const tasks = graph.tasks.filter((task) => task.feature === feature);
  return tasks.length > 0 && tasks.every((task) => task.status === "done" && !["invalid", "unverifiable"].includes(task.bindingStatus) && !task.architectureDiagnostics?.length)
    && !featureHasErrors(graph, feature)
    && !(graph.architectures || []).some((entry) => entry.feature === feature && (architectureBlocksDevelopment(entry) || ["actual_pending_review", "baseline_pending"].includes(entry.workflowStatus || entry.status)));
}

function featureTitle(graph, feature) {
  return graph.specs.find((spec) => spec.feature === feature)?.title || feature;
}

function workspaceMarkup(graph) {
  const references = graph.specs.filter((spec) => spec.view === "architecture").map((spec) => spec.feature);
  const features = graph.features.filter((feature) => !references.includes(feature));
  const completed = features.filter((feature) => featureIsHistory(graph, feature));
  const active = features.filter((feature) => !completed.includes(feature));
  const priority = (feature) => graph.tasks.some((task) => task.feature === feature && task.status === "in_progress") ? 0 : graph.tasks.some((task) => task.feature === feature && task.status === "blocked") ? 1 : 2;
  active.sort((a, b) => priority(a) - priority(b));
  if (followCurrentFeature || !["overview", ...features].includes(selectedFeature)) {
    const nextFeature = active[0] || "overview";
    if (selectedFeature !== nextFeature) selectedTaskStatus = "all";
    selectedFeature = nextFeature;
  }
  const options = (features) => features.map((feature) => `<option value="${escapeHtml(feature)}"${selectedFeature === feature ? " selected" : ""}>${escapeHtml(featureTitle(graph, feature))}</option>`).join("");
  const header = `<header class="header"><h1>开发任务视图</h1><select id="feature-filter" aria-label="选择工作范围"><option value="overview"${selectedFeature === "overview" ? " selected" : ""}>工作概览</option>${active.length ? `<optgroup label="当前工作">${options(active)}</optgroup>` : ""}${completed.length ? `<optgroup label="已完成工单">${options(completed)}</optgroup>` : ""}</select></header>`;
  let content;
  if (selectedFeature === "overview") {
    content = `<section class="section workspace-empty"><h2>${active.length ? "选择要继续的功能" : "当前没有待开发工单"}</h2><p>${active.length ? "从上方选择一个功能，查看当前任务与阻塞原因。" : completed.length ? "已有工单均已完成。历史规格、架构与工单可在下方查阅；工单完成不代表已经发布。" : "还没有本地工单。完成规格与任务拆分后，这里会显示当前工作。"}</p></section>`;
  } else {
    const tasks = visibleTasks(graph);
    const summary = summarize(tasks);
    const taskContent = `<section class="execution-panel"><h2 class="section-title">任务工单</h2>${taskTabs(tasks)}<ul class="task-list">${taskList(tasks, graph)}</ul>${renderGraph(graph, tasks)}</section>`;
    content = `<section class="section feature-heading"><small>${completed.includes(selectedFeature) ? "历史记录 · 工单已完成" : "当前功能"}</small><h2>${escapeHtml(featureTitle(graph, selectedFeature))}</h2><p>${escapeHtml(selectedFeature)}</p></section><section class="section progress-section">${progressPanel(summary)}</section>${graph.errors.length ? `<section class="error"><strong>计划需要修正</strong><ul>${graph.errors.map((error) => `<li>${escapeHtml(error.message)}${error.path ? `<small class="source-path">${escapeHtml(displayPath(error.path))}</small>` : ""}</li>`).join("")}</ul></section>` : ""}${sddFlow(graph, tasks, summary, taskContent)}`;
  }
  const architectureReferences = references.map((feature) => {
    const entry = (graph.architectures || []).find((item) => item.feature === feature);
    const presentation = architecturePresentation(entry ? [entry] : [], []);
    return sddCard("架构设计", presentation.state, presentation.label, "系统结构与架构图", entry ? architecturePreview(entry) : '<p class="architecture-warning">架构图尚未记录。</p>', false, "architecture", "architecture-reference");
  }).join("");
  const history = completed.length ? `<details class="feature-history"${historyOpen ? " open" : ""}><summary>已完成 · ${completed.length} 个功能<span>查看历史记录</span></summary><p>这里收纳已完成的工单，不代表发布或验收证据已齐全。</p><ul>${completed.map((feature) => `<li><button type="button" data-feature-record="${escapeHtml(feature)}"><strong>${escapeHtml(featureTitle(graph, feature))}</strong><small>${escapeHtml(feature)} · ${graph.tasks.filter((task) => task.feature === feature).length} 项工单</small><span>查看记录 →</span></button></li>`).join("")}</ul></details>` : "";
  return `<div class="shell">${header}${architectureReferences ? `<section class="section sdd-cards">${architectureReferences}</section>` : ""}${content}${history}<p class="updated">基于本地 Markdown 规格与任务图 · 自动刷新</p></div>`;
}

function render(graph) {
  app.innerHTML = workspaceMarkup(graph);
  app.querySelectorAll(".feature-graph").forEach((detail) => detail.addEventListener("toggle", () => {
    if (!detail.isConnected) return;
    if (detail.open) {
      expandedGraphFeatures.add(detail.dataset.feature);
      const frame = detail.querySelector("iframe");
      if (!frame.hasAttribute("src")) frame.src = frame.dataset.src;
    } else expandedGraphFeatures.delete(detail.dataset.feature);
  }));
  app.querySelector(".feature-history")?.addEventListener("toggle", (event) => { if (event.target.isConnected) historyOpen = event.target.open; });
  app.querySelectorAll(".task-feature-group").forEach((detail) => detail.addEventListener("toggle", () => {
    if (!detail.isConnected) return;
    if (detail.open) collapsedTaskFeatures.delete(detail.dataset.feature);
    else collapsedTaskFeatures.add(detail.dataset.feature);
  }));
  const chooseFeature = (feature) => { selectedFeature = feature; followCurrentFeature = false; selectedTaskStatus = "all"; render(graph); };
  app.querySelector("#feature-filter")?.addEventListener("change", (event) => chooseFeature(event.target.value));
  app.querySelectorAll("[data-feature-record]").forEach((button) => button.addEventListener("click", () => chooseFeature(button.dataset.featureRecord)));
  app.querySelectorAll(".task-tab").forEach((tab) => tab.addEventListener("click", () => { selectedTaskStatus = tab.dataset.status; render(graph); }));
}

async function refresh() {
  try { render(await (await fetch("/api/snapshot", { cache: "no-store" })).json()); } catch { app.textContent = "无法读取本地任务快照。"; }
}

refresh();
new EventSource("/events").addEventListener("refresh", refresh);
