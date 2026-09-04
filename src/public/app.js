// Read-only SDD workspace; the snapshot remains the source of truth.
const app = document.querySelector('#app');
const inspector = document.querySelector('#inspector');
const params = new URLSearchParams(location.search);
let state = { view: params.get('view') || 'overview', mode: params.get('mode') || 'list', feature: params.get('feature') || '', status: params.get('status') || 'all', task: params.get('task') || '' };
let graph;
let connection = 'connecting';
let refreshId = 0;
const collapsedGraphFeatures = new Set();
const statusNames = {done:'已完成',in_progress:'进行中',ready:'待开始',blocked:'受阻'};
const criterionNames = {pending:'未勾选',implemented:'已实现，待验收',accepted:'已验收'};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 mark:'<path d="M5 5h5v5H5zM14 14h5v5h-5zM14 5h5v5h-5zM10 7.5h4M7.5 10v6.5H14"/>',
 arrow:'<path d="m9 5 7 7-7 7"/>',back:'<path d="m14 5-7 7 7 7"/>',out:'<path d="M7 17 17 7M7 7h10v10"/>',check:'<path d="m5 12 4 4 10-10"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
 spec:'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',architecture:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M6 9v3h12V9M12 12v3"/>',tasks:'<path d="m3 5 2 2 3-4M11 5h10M3 12h4M11 12h10M3 19h4M11 19h10"/>',code:'<path d="m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18"/>',shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',graph:'<rect x="2" y="9" width="5" height="6" rx="1"/><rect x="17" y="2" width="5" height="6" rx="1"/><rect x="17" y="16" width="5" height="6" rx="1"/><path d="M7 12h5V5h5M12 12v7h5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>'
};
const icon = (name, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.info}</svg>`;
const pill = (text, kind='neutral') => `<span class="badge ${kind}">${kind==='done'?icon('check'):''}${escape(text)}</span>`;
const taskPill = task => pill(statusNames[task.status] || '未知状态',task.status==='done'?'done':task.status==='blocked'?'waiting':'neutral');
const relative = value => String(value || '').split('/.scratch/').pop();
const reference = feature => (graph.specs || []).some(s=>s.feature===feature && s.view==='architecture');
const features = () => [...new Set([...(graph.features || []),...graph.tasks.map(t=>t.feature),...(graph.specs || []).map(s=>s.feature),...(graph.architectures || []).map(a=>a.feature)])].filter(f=>!reference(f));
const tasks = () => graph.tasks.filter(t=>t.feature===state.feature && !reference(t.feature));
const spec = () => (graph.specs || []).find(s=>s.feature===state.feature);
const architectures = () => (graph.architectures || []).filter(a=>a.feature===state.feature || reference(a.feature));
const criteria = () => tasks().flatMap(t=>t.acceptanceCriteria);
const counted = () => ({total:tasks().length,done:tasks().filter(t=>t.status==='done').length,active:tasks().filter(t=>t.status==='in_progress').length,pending:criteria().filter(c=>c.state!=='accepted').length,accepted:criteria().filter(c=>c.state==='accepted').length});
function syncURL(){const p=new URLSearchParams(); for(const [k,v] of Object.entries(state)) if(v)p.set(k,v); history.replaceState(null,'',`?${p}`);}
function navigate(changes){state={...state,task:'',...changes};syncURL();if(inspector.open)inspector.close();render();window.scrollTo(0,0);}
function nextStep() {
 const c = counted();
 const running = tasks().find(t => t.status === 'in_progress');
 const blocked = tasks().find(t => t.status === 'blocked');
 const ready = tasks().find(t => graph.frontier.includes(t.id));
 const actualArchitectures = architectures().filter(a => !reference(a.feature));
 const failed = actualArchitectures.find(architectureBlocksDevelopment);
 const binding = tasks().find(t => ['invalid', 'unverifiable'].includes(t.bindingStatus) || t.architectureDiagnostics?.length);
 const review = actualArchitectures.find(a => ['actual_pending_review', 'baseline_pending'].includes(a.workflowStatus));
 if (graph.errors.length) return {label:'计划需修正',title:'先核对计划中的诊断',description:graph.errors[0].message,action:'查看开发工单',changes:{view:'tasks'}};
 if (failed || binding || review) return {
   label: running && failed ? '待安全暂停' : '开发条件待核对',
   title: running && failed ? '完成安全检查点后暂停' : '先核对架构设计中的记录',
   description: running?.architectureAction?.message || failed?.nextStep || (binding ? '修正工单的修订绑定后再继续。' : review.nextStep),
   action:'查看架构设计', changes:{view:'architecture'}
 };
 if (running) return {label:'实施进行中',title:`继续完成工单 ${running.localId}`,description:running.title,action:'查看当前工单',changes:{view:'tasks',task:running.id}};
 if (blocked) return {label:'有任务受阻',title:`处理工单 ${blocked.localId} 的阻塞`,description:blocked.blockedReason,action:'查看阻塞原因',changes:{view:'tasks',task:blocked.id}};
 if (ready) return {label:'可以开始',title:`下一张工单 ${ready.localId}`,description:ready.title,action:'查看工单',changes:{view:'tasks',task:ready.id}};
 if (c.total && c.done === c.total) return {label:'验收待核对',title:'实现已完成，核对验收与交付',description:`${c.total} 张工单已标记完成${c.pending ? `，${c.pending} 条验收清单仍未确认` : ''}。核对清单，并补充验证记录。`,action:'核对验收清单',changes:{view:'verification'}};
 return c.total ? {label:'等待前置条件',title:'核对未完成的前置依赖',description:'当前没有可执行工单，请查看依赖状态与阻塞原因。',action:'查看依赖图',changes:{view:'tasks',mode:'graph'}} : {label:'等待计划',title:'从一份清楚的规格开始',description:'准备好本地规格与开发工单后，这里会显示下一步。',action:'查看规格',changes:{view:'spec'}};
}
function stageRow(index,title,description,label,target,type,kind='done') {return `<button class="stage" data-view="${target}"><span class="stage-no">0${index}</span><span class="stage-icon ${kind==='waiting'?'pending':''}">${icon(type)}</span><span class="stage-copy"><strong>${title}</strong><small>${escape(description)}</small></span>${pill(label,kind)}${icon('arrow','arrow')}</button>`;}
function overview(){const c=counted(),next=nextStep(),arch=architecturePresentation(architectures(),graph.tasks),archOK=arch.state==='done';return `<div class="overview-grid"><section class="next"><div class="next-head"><span class="eyebrow">下一步 / NEXT STEP</span>${pill(next.label,'waiting')}</div><h2>${escape(next.title)}</h2><p>${escape(next.description)}</p><div class="next-actions"><button class="primary" data-next>${escape(next.action)}${icon('arrow')}</button><button class="text-button" data-view="tasks">查看全部工单 ${icon('out')}</button></div></section><div class="metrics"><div class="metric"><strong>${c.done}<span>/ ${c.total}</span></strong><p>工单已完成</p></div><div class="metric"><strong>${c.active}</strong><p>工单进行中</p></div><div class="metric"><strong>${c.pending}</strong><p>验收待核对</p></div></div><section class="journey"><div class="section-head"><h2>SDD 开发流程</h2><span>设计 → 实施 → 验证</span></div><div class="stages">${stageRow(1,'规格与边界','目标、方案与验收约定',spec()?'已记录':'待记录','spec','spec',spec()?'done':'neutral')}${stageRow(2,'架构设计',archOK?'规划、实际与长期基线':'系统结构与架构状态',arch.label,'architecture','architecture',archOK?'done':arch.state==='ready'?'neutral':'waiting')}${stageRow(3,'任务计划',`${c.total} 张工单 · 查看前置依赖`,c.total?'已拆分':'待拆分','tasks','tasks',c.total?'done':'neutral')}${stageRow(4,'开发实施',`${c.done} / ${c.total} 张工单标记完成`,c.done===c.total&&c.total?'已完成':'查看任务','tasks','code',c.done===c.total&&c.total?'done':'neutral')}${stageRow(5,'验证与交付',c.pending?'验收记录与交付证据待补充':'核对验证与交付证据','待核对','verification','shield','waiting')}</div><p class="fine-print">${icon('info')}工单完成、验收确认和交付分别记录。</p></section></div>`;}
function taskList(){const items=tasks().filter(t=>state.status==='all'||t.status===state.status);return items.length?`<div class="task-table">${items.map(t=>`<button class="task-row" data-task="${escape(t.id)}"><span class="task-number">${escape(t.localId)}</span><span class="task-info"><strong>${escape(t.title)}</strong><small>${escape(t.phase)} <span aria-hidden="true">·</span> ${t.acceptanceCriteria.filter(c=>c.state!=='accepted').length} 项验收待核对</small></span>${taskPill(t)}${icon('arrow','arrow')}</button>`).join('')}</div>`:'<p class="empty">这个状态下没有工单。</p>';}
function dependencyLabel(id) {
 const task = graph.tasks.find(t => t.id === id);
 return task?.feature === state.feature ? task.localId : id;
}
function taskGraph() {
 const items = tasks();
 if (!items.length) return '<p class="empty">尚无开发工单。</p>';
 const route = `/workflow/${encodeURIComponent(state.feature)}/artifact.html`;
 const external = items.flatMap(t=>t.dependsOn.filter(id=>!items.some(x=>x.id===id)).map(id=>`<li>${escape(t.id)} ← ${escape(id)}</li>`));
 return `<details class="feature-graph" data-feature="${escape(state.feature)}"${collapsedGraphFeatures.has(state.feature)?'':' open'}>
   <summary><span><strong>${escape(spec()?.title || state.feature)}</strong><small>${escape(state.feature)} · ${items.length} 项任务</small></span><span class="graph-toggle"><span class="when-open">收起</span><span class="when-closed">展开</span></span></summary>
   ${graph.errors.length?'<p class="note">计划需修正，请核对下方工单与诊断。</p>':`<div class="workflow-preview"><span class="workflow-label">ARCHIFY · 任务依赖</span><a class="workflow-open" href="${route}?theme=light" target="_blank" rel="noopener noreferrer">展开大图 ↗</a><iframe title="${escape(state.feature)} 任务依赖图" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="${route}?embed=1&theme=light"></iframe></div>`}
   <div class="workflow-tickets" aria-label="定位工单">${items.map(t=>`<button data-task="${escape(t.id)}" title="${escape(t.title)}">${escape(t.localId)} · ${escape(t.phase)}</button>`).join('')}</div>
   ${external.length?`<div class="graph-external"><strong>跨功能依赖</strong><ul>${external.join('')}</ul></div>`:''}
 </details>`;
}
function taskView(){return `<div class="page-heading"><h2>开发工单</h2><p>${tasks().length} 张工单 · 只展示实际开发内容</p></div><div class="toolbar"><div class="segmented" aria-label="工单显示方式"><button aria-pressed="${state.mode==='list'}" data-mode="list">${icon('tasks')}列表</button><button aria-pressed="${state.mode==='graph'}" data-mode="graph">${icon('graph')}依赖图</button></div>${state.mode==='list'?`<select class="filter" aria-label="筛选工单状态"><option value="all">全部状态</option>${Object.entries(statusNames).map(([id,label])=>`<option value="${id}" ${state.status===id?'selected':''}>${label}</option>`).join('')}</select>`:'<span class="eyebrow">TASK DEPENDENCIES</span>'}</div>${state.mode==='graph'?taskGraph():taskList()}<p class="note">工单状态和验收记录独立。未勾选的清单需要核对，不代表代码尚未实现。</p>`;}
const back = () => `<button class="back" data-view="overview">${icon('back')}SDD 开发流程</button>`;
function specView(){const s=spec();return `${back()}<div class="page-heading"><span class="eyebrow">01 / SPECIFICATION</span><h2>规格与边界</h2><p>${escape(s?.title || state.feature)}</p></div>${s?Object.entries(s.sections).map(([name,value])=>`<details class="disclosure" ${['Problem Statement','目标'].includes(name)?'open':''}><summary>${escape(({'Problem Statement':'目标与背景','Solution':'实施方案','User Stories':'用户故事','Implementation Decisions':'实施决策','Testing Decisions':'验证策略','Out of Scope':'不在范围','Further Notes':'补充说明'})[name] || name)}</summary><div><p>${escape(value)}</p></div></details>`).join(''):'<p class="empty">尚无规格记录。</p>'}`;}
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
    return `<span class="architecture-affects-label">原组件 ID</span><span class="architecture-affects-values">${affects.map((id) => `<code>${escape(id)}</code>`).join(" ")}</span>`;
  }
  const components = new Map((task.affectedComponents || []).map((component) => [component.id, component]));
  const route = `/architecture/${encodeURIComponent(task.feature)}/artifact.html?theme=light`;
  return `<span class="architecture-affects-label">影响组件</span><span class="architecture-affects-values">${affects.map((id) => {
    const component = components.get(id);
    const label = component?.label || id;
    return `<a href="${escape(`${route}#focus=${encodeURIComponent(id)}`)}" target="_blank" rel="noopener noreferrer"><strong>${escape(label)}</strong><small>${escape(id)}</small></a>`;
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
  return `<ul class="architecture-diagnostics">${diagnostics.map((entry) => `<li>${escape(entry.message)}</li>`).join("")}</ul>`;
}
function hasArchitectureBinding(task) {
  return Boolean(task.architectureRevision
    || (Array.isArray(task.affects) && task.affects.length)
    || ["valid", "invalid", "unverifiable"].includes(task.bindingStatus)
    || task.architectureDiagnostics?.length);
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
  return `<ul class="architecture-bindings">${bound.map((task) => `<li><div class="architecture-binding-ticket"><strong><span class="task-id">${escape(task.localId)}</span>${escape(task.title)}</strong><span>${escape(architectureBindingLabel(task))}</span></div><div class="architecture-affects">${taskAffectedComponents(task, architecture)}</div>${architectureDiagnosticList(task)}</li>`).join("")}</ul>`;
}
function yesNo(value) {
  return value ? "是" : "否";
}
function architectureReviewContent(architecture) {
  if (!architecture.actual) return "";
  const kindLabels = { added: "新增", changed: "变更", removed: "移除" };
  const differences = architecture.actual.differences?.length
    ? `<ul class="architecture-diagnostics">${architecture.actual.differences.map((difference) => `<li><strong>${escape(kindLabels[difference.kind] || difference.kind)} · ${escape(difference.componentId)}</strong>：${escape(difference.summary)}；原因：${escape(difference.rationale)}</li>`).join("")}</ul>`
    : '<p class="sdd-empty">尚未记录规划与实际差异。</p>';
  const baseline = architecture.baseline?.status === "foreign_feature" || architecture.baseline?.status === "from_other_feature"
    ? `<p class="architecture-warning">当前项目基线来自 ${escape(architecture.baseline.sourceFeature || "其他功能")}；本功能尚未提升。</p>`
    : architecture.workflowStatus === "baseline_verified"
      ? '<p class="architecture-skip">长期基线已验证，且与批准的实际架构四件套精确一致。</p>'
      : architecture.workflowStatus === "baseline_pending"
        ? '<p class="architecture-warning">实际架构已批准，长期基线仍待外部流程精确提升。</p>'
        : "";
  return `<details class="disclosure"><summary>实际架构复核</summary><div><dl class="architecture-compact-grid"><div><dt>实现完成</dt><dd>${yesNo(architecture.implementationComplete)}</dd></div><div><dt>交付核验</dt><dd>${yesNo(architecture.deliveryVerified)}</dd></div><div><dt>工具校验</dt><dd>${yesNo(architecture.toolValidationPassed)}</dd></div><div><dt>用户批准</dt><dd>${yesNo(architecture.userApproved)}</dd></div></dl><p>${escape(architecture.actual.reason || "尚未记录总体复核说明")}</p>${differences}${baseline}</div></details>`;
}
function architectureContent(architectures, tasks = []) {
  if (!architectures.length) return '<p class="sdd-empty">此旧功能没有架构记录；兼容展示且不据此推断架构已批准。</p>';
  if (architectures.length > 1) {
    return `<p class="sdd-empty">请选择一个功能查看可信架构概览；全部功能视图不会同时加载多张大图。</p><ul class="architecture-feature-list">${architectures.map((architecture) => `<li><strong>${escape(architecture.feature)}</strong><span>${escape(architectureStatusLabels[architecture.workflowStatus || architecture.status] || "待确认")}</span></li>`).join("")}</ul>`;
  }

  const architecture = architectures[0];
  const route = `/architecture/${encodeURIComponent(architecture.feature)}/artifact.html`;
  const components = architecture.components?.length
    ? `<ul class="architecture-components">${architecture.components.map((component) => `<li><strong>${escape(component.label)}</strong><span>${escape(component.id)}</span></li>`).join("")}</ul>`
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
    ? `${staleNotice}<div class="architecture-frame-shell"><span class="architecture-frame-label">ARCHIFY · 架构概览</span><a class="architecture-frame-open" href="${escape(`${route}?theme=light`)}" target="_blank" rel="noopener noreferrer">展开大图 ↗</a><iframe title="Archify 架构图概览" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" src="${escape(`${route}?embed=1&theme=light`)}"></iframe><span class="architecture-frame-overview">窄面板只显示架构概览；节点阅读请展开大图。</span></div>`
    : '<p class="architecture-warning"><strong>架构图不可展示：</strong>缺少可信回执或展示工件校验失败。</p>';
  return `<div class="architecture-next-action"><span aria-hidden="true">→</span><p><strong>下一步</strong>${escape(architecture.nextStep)}</p></div><dl class="architecture-compact-grid"><div><dt>设计类型</dt><dd>${escape(architectureModeLabel(architecture.mode))}</dd></div><div><dt>架构变化</dt><dd>${escape(architecture.reason || "尚未记录")}</dd></div></dl><section class="architecture-section"><h4>生命周期</h4><dl class="architecture-lifecycle"><div><dt>当前架构</dt><dd>${escape(architectureLifecycleLabel(architecture.lifecycle?.current))}</dd></div><div><dt>目标架构</dt><dd>${escape(architectureLifecycleLabel(architecture.lifecycle?.target))}</dd></div><div><dt>实际架构</dt><dd>${escape(architectureLifecycleLabel(architecture.lifecycle?.actual))}</dd></div><div><dt>长期基线</dt><dd>${escape(architectureLifecycleLabel(architecture.lifecycle?.baseline))}</dd></div></dl></section>${artifact}${architectureReviewContent(architecture)}<details class="disclosure"><summary>修订绑定</summary><div><dl class="architecture-revisions"><div><dt>当前架构摘要</dt><dd><code>${escape(architectureHash(architecture.hashes?.currentSpecification))}</code></dd></div><div><dt>交付回执摘要</dt><dd><code>${escape(architectureHash(architecture.hashes?.receiptSpecification))}</code></dd></div><div><dt>批准修订</dt><dd><code>${escape(architectureHash(architecture.hashes?.approvedSpecification))}</code></dd></div></dl></div></details><details class="disclosure"><summary>${componentsHeading}</summary><div>${componentsNotice}${components}</div></details><details class="disclosure"><summary>绑定工单</summary><div>${architectureBindings(architecture, tasks)}</div></details>`;
}
function architectureView(){return `${back()}<div class="page-heading"><span class="eyebrow">02 / ARCHITECTURE</span><h2>架构设计</h2><p>系统如何组成，以及设计与实现是否一致。</p></div>${architectures().length?architectures().map(a=>`<section class="architecture-record"><div class="section-head"><h2>${escape(a.feature)}</h2>${pill(architecturePresentation([a],graph.tasks).label,architecturePresentation([a],graph.tasks).state==='done'?'done':'waiting')}</div>${architectureContent([a],graph.tasks)}</section>`).join(''):architectureContent([])}`;}

function verificationView(){const c=counted();return `${back()}<div class="page-heading"><span class="eyebrow">05 / VERIFICATION</span><h2>验证与交付</h2><p>用验收记录确认结果。</p></div><div class="verification-summary"><span class="eyebrow">验收清单已确认</span><p><strong>${c.accepted}<span class="muted"> / ${criteria().length}</span></strong></p><p>${c.done} 张工单标记完成，${c.pending} 项验收仍待核对。</p></div>${tasks().map(t=>`<button class="verify-task" data-task="${escape(t.id)}"><span class="mono">${escape(t.localId)}</span><strong>${escape(t.title)}</strong><small>${t.acceptanceCriteria.filter(c=>c.state!=='accepted').length} 项待核对</small>${icon('arrow')}</button>`).join('')}<div class="section-head"><h2>交付证据</h2><span>与工单状态独立</span></div><ul class="evidence-lines"><li>测试与评审结果<span class="muted">快照未提供</span></li><li>界面验证记录<span class="muted">快照未提供</span></li><li>发布回读<span class="muted">快照未提供</span></li></ul><p class="fine-print">${icon('info')}这里仅展示已有记录。此页面不会执行测试、批准或发布。</p>`;}
function render(){
 if(!graph)return;
 if(!features().includes(state.feature))state.feature=features()[0] || '';
 if(!['overview','tasks','spec','architecture','verification'].includes(state.view))state.view='overview';
 if(!['list','graph'].includes(state.mode))state.mode='list';
 if(!['all',...Object.keys(statusNames)].includes(state.status))state.status='all';
 const content=({overview, tasks:taskView, spec:specView, architecture:architectureView, verification:verificationView})[state.view]();
 app.innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><span class="brand-mark">${icon('mark')}</span>Matt <span class="workspace-label">SDD 工作台</span></div><span class="connection ${connection==='live'?'live':''}" id="connection"><i></i>${connection==='offline'?'连接中断，重连中':'本地快照'}<span class="optional"> · 只读</span></span></header><div class="project"><div><h1>${escape(spec()?.title || '开发工作台')}</h1><p class="mono">${escape(state.feature || '无开发工单')}</p></div>${features().length>1?`<select aria-label="选择功能" id="feature">${features().map(f=>`<option value="${escape(f)}" ${f===state.feature?'selected':''}>${escape(f)}</option>`).join('')}</select>`:''}</div><nav class="nav" aria-label="工作台视图"><button aria-current="${state.view!=='tasks'}" data-view="overview">SDD 概览</button><button aria-current="${state.view==='tasks'}" data-view="tasks">开发工单 <span class="count">${tasks().length}</span></button></nav><main class="content"><div class="view">${graph.errors.length?`<p class="error">${graph.errors.map(e=>escape(e.message)).join('<br>')}</p>`:''}${content}</div></main><footer class="footer"><span>本地 Markdown · 自动读取</span><span>开发工作台 · 只读</span></footer></div>`;
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate({view:b.dataset.view}));
 document.querySelector('[data-next]')?.addEventListener('click',()=>{const c=nextStep().changes;navigate(c);if(c.task)openTask(c.task);});
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>navigate({view:'tasks',mode:b.dataset.mode}));
 document.querySelector('.filter')?.addEventListener('change',e=>navigate({status:e.target.value}));
 document.querySelector('#feature')?.addEventListener('change',e=>navigate({feature:e.target.value,status:'all'}));
 app.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>openTask(b.dataset.task));
 app.querySelectorAll('.feature-graph').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)collapsedGraphFeatures.delete(d.dataset.feature);else collapsedGraphFeatures.add(d.dataset.feature);}));
 if(state.task){if(graph.tasks.some(t=>t.id===state.task&&!reference(t.feature)))openTask(state.task,false);else{state.task='';syncURL();if(inspector.open)inspector.close();}}
}
function openTask(id,update=true){const scrollTop=state.task===id?inspector.scrollTop:0;const t=graph.tasks.find(t=>t.id===id&&!reference(t.feature));if(!t)return;state.task=id;if(update)syncURL();const before=t.dependsOn.map(id=>graph.tasks.find(x=>x.id===id)||{id,missing:true});inspector.innerHTML=`<header class="detail-header"><span>工单详情 / <span class="mono">${escape(t.localId)}</span></span><button class="close" aria-label="关闭工单详情">${icon('close')}</button></header><div class="detail-body"><div class="dialog-title-row"><span class="eyebrow">${escape(t.phase)}</span>${taskPill(t)}</div><h2 id="detail-title">${escape(t.title)}</h2><p class="inspector-note">${escape(t.id)}</p><div class="section-head"><h2>前置依赖</h2></div>${before.length?before.map(x=>x.missing?`<span class="dependency">${escape(x.id)} · 依赖工单缺失，待修正</span>`:reference(x.feature)?`<span class="dependency">${escape(x.id)} · ${escape(statusNames[x.status])}</span>`:`<button class="dependency" data-dependency="${escape(x.id)}">${taskPill(x)}${escape(dependencyLabel(x.id))} · ${escape(x.title)}</button>`).join(''):'<p class="muted">无前置依赖。</p>'}${t.blockedReason?`<p class="note">${escape(t.blockedReason)}</p>`:''}<div class="section-head"><h2>验收清单</h2><span>${t.acceptanceCriteria.filter(c=>c.state==='accepted').length} / ${t.acceptanceCriteria.length} 已确认</span></div>${t.status==='done'&&t.acceptanceCriteria.some(c=>c.state!=='accepted')?'<p class="inspector-note">工单已完成，清单仍未勾选，请核对记录。</p>':''}<ul class="checklist">${t.acceptanceCriteria.map(c=>`<li><span class="criterion-state ${escape(c.state)}" aria-hidden="true">${c.state==='accepted'?'✓':c.state==='implemented'?'△':'○'}</span><span class="criterion-copy"><small>${escape(criterionNames[c.state] || '未确认')}</small>${escape(c.text)}</span></li>`).join('')}</ul><details class="disclosure"><summary>工单来源</summary><div><p>${escape(relative(t.path))}</p></div></details><p class="detail-path">只读内容 · 更新请回到原始 Markdown 工单。</p></div>`;
 inspector.querySelector('.close').onclick=()=>inspector.close();inspector.querySelectorAll('[data-dependency]').forEach(b=>b.onclick=()=>openTask(b.dataset.dependency));if(!inspector.open)inspector.showModal();inspector.scrollTop=scrollTop;}
inspector.addEventListener('close',()=>{if(!inspector.open){state.task='';syncURL();}});
inspector.addEventListener('click',e=>{if(e.target===inspector&&e.clientX<inspector.getBoundingClientRect().left)inspector.close();});
async function refresh() {
 const requestId = ++refreshId;
 try {
   const r = await fetch('/api/snapshot',{cache:'no-store'});
   if (!r.ok) throw Error('snapshot');
   const snapshot = await r.json();
   if (requestId !== refreshId) return;
   graph = snapshot;
   render();
 } catch {
   if (requestId !== refreshId) return;
   if (graph) { connection='offline'; render(); }
   else app.innerHTML='<p class="loading">无法读取本地快照，请刷新重试。</p>';
 }
}
function updateConnection(value) {
 connection=value;
 const indicator=document.querySelector('#connection');
 if (indicator) { indicator.className=`connection ${value==='live'?'live':''}`; indicator.innerHTML=`<i></i>${value==='offline'?'连接中断，重连中':'本地快照'}<span class="optional"> · 只读</span>`; }
}
refresh();
const events=new EventSource('/events');
events.addEventListener('refresh',refresh);
events.addEventListener('open',()=>{updateConnection('live');refresh();});
events.addEventListener('error',()=>updateConnection('offline'));
