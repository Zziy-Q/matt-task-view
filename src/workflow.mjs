import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../vendor/archify/bin/archify.mjs", import.meta.url));
const labels = { done: "已完成", ready: "待开始", in_progress: "进行中", blocked: "已阻塞" };

function errorFeature(error) {
  const parts = String(error.path || "").split(/[\\/]/u);
  const index = parts.lastIndexOf(".scratch");
  return index === -1 ? null : parts[index + 1];
}

function runArchify(args) {
  const env = { ARCHIFY_UPDATE_CHECK_DISABLED: "1" };
  for (const name of ["LANG", "LC_ALL", "PATH", "TMPDIR"]) if (process.env[name]) env[name] = process.env[name];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { detached: process.platform !== "win32", env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let settled = false;
    const stop = () => {
      try { process.platform === "win32" ? child.kill("SIGKILL") : process.kill(-child.pid, "SIGKILL"); } catch { /* already exited */ }
    };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => { stop(); finish(new Error("Archify delivery timed out")); }, 15_000);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) { stop(); finish(new Error("Archify output exceeded limit")); return; }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) { stop(); finish(new Error("Archify output exceeded limit")); return; }
      stderr.push(chunk);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => finish(code === 0 ? null : new Error(Buffer.concat(stderr).toString("utf8") || `Archify exited with ${code}`), Buffer.concat(stdout).toString("utf8")));
  });
}

export function workflowSpecification(graph, feature) {
  const tasks = graph.tasks.filter((task) => task.feature === feature);
  if (!tasks.length || graph.errors.some((error) => errorFeature(error) === feature)) throw new Error("Task plan unavailable");
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ids = new Map(tasks.map((task) => [task.id, `task_${Buffer.from(task.id).toString("hex")}`]));
  const ranks = new Map();
  const visiting = new Set();
  function rank(task) {
    if (ranks.has(task.id)) return ranks.get(task.id);
    if (visiting.has(task.id)) throw new Error("Cyclic task dependencies");
    visiting.add(task.id);
    const parents = task.dependsOn.map((id) => byId.get(id)).filter(Boolean);
    const value = parents.length ? Math.max(...parents.map(rank)) + 1 : 0;
    visiting.delete(task.id);
    ranks.set(task.id, value);
    return value;
  }
  tasks.forEach(rank);
  // ponytail: a 12-node, six-layer overview keeps the sidebar readable; the task index retains the full plan.
  const diagramTasks = tasks.filter((task) => ranks.get(task.id) <= 5).sort((a, b) => ranks.get(a.id) - ranks.get(b.id)).slice(0, 12);
  const diagramIds = new Set(diagramTasks.map((task) => task.id));
  const lanes = [];
  const rankCounts = new Map();
  const nodes = diagramTasks.map((task) => {
    const column = ranks.get(task.id);
    const row = rankCounts.get(column) || 0;
    rankCounts.set(column, row + 1);
    if (!lanes[row]) lanes[row] = { id: `lane_${row}`, label: row ? `并行任务 ${row + 1}` : "任务实施" };
    const phase = task.phase === "未分阶段" ? "任务" : task.phase;
    return {
      id: ids.get(task.id), lane: lanes[row].id, col: column,
      type: "backend",
      label: `${task.localId} ${phase}`, tag: labels[task.status], width: Math.max(160, (task.localId.length + phase.length) * 14 + 30),
    };
  });
  const external = tasks.flatMap((task) => task.dependsOn.filter((id) => !byId.has(id)).map((id) => `${task.id} ← ${id}`));
  return {
    schema_version: 2, diagram_type: "workflow",
    meta: { title: graph.specs.find((spec) => spec.feature === feature)?.title || feature, locale: "zh-CN", quality_profile: "showcase", legend: { mode: "hidden", entries: { backend: { label: "任务工单" } } } },
    lanes, nodes,
    edges: graph.edges.filter((edge) => diagramIds.has(edge.from) && diagramIds.has(edge.to)).map((edge) => ({ from: ids.get(edge.from), to: ids.get(edge.to), label: "完成后开始" })),
    cards: [
      { dot: "emerald", title: "当前进度", items: [`${tasks.filter((task) => task.status === "done").length} / ${tasks.length} 项任务已完成`, "任务状态取自本地 Markdown 票据", ...(diagramTasks.length < tasks.length ? [`图中显示前 ${diagramTasks.length} 项；完整计划见任务索引`] : [])] },
      { dot: "cyan", title: "任务索引", items: tasks.map((task) => `${task.localId} ${task.title}`) },
      { dot: "amber", title: external.length ? "跨功能依赖" : "验证与交付", items: external.length ? external : ["任务完成不等于已经发布", "测试、评审与交付证据独立核对"] },
    ],
  };
}

export async function deliverWorkflow(specification) {
  const directory = await mkdtemp(join(tmpdir(), "matt-workflow-"));
  try {
    const source = JSON.stringify(specification, null, 2) + "\n";
    const input = join(directory, "workflow.json");
    const output = join(directory, "workflow.html");
    await writeFile(input, source);
    const stdout = await runArchify([cli, "deliver", "workflow", input, output, "--quality", "showcase", "--json"]);
    const receipt = JSON.parse(stdout);
    const html = await readFile(output);
    const digest = (value) => createHash("sha256").update(value).digest("hex");
    if (!receipt.ok || receipt.validation?.errors !== 0 || receipt.validation?.warnings !== 0
      || receipt.validation?.checksPassed !== 9
      || receipt.specification?.sha256 !== digest(source) || receipt.artifact?.sha256 !== digest(html)) {
      throw new Error("Workflow delivery verification failed");
    }
    return html;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
