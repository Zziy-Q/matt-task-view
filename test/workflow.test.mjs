import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { workflowSpecification } from "../src/workflow.mjs";

test("workflow adapter keeps feature tasks horizontal and exposes full task titles", () => {
  const tasks = [
    { id: "demo/01", localId: "01", feature: "demo", title: "建立任务图", phase: "任务模型", status: "done", dependsOn: [] },
    { id: "demo/02", localId: "02", feature: "demo", title: "展示本地视图", phase: "实时服务", status: "ready", dependsOn: ["demo/01"] },
  ];
  const specification = workflowSpecification({
    errors: [], tasks, edges: [{ from: "demo/01", to: "demo/02" }], specs: [{ feature: "demo", title: "Matt Task View" }],
  }, "demo");

  assert.equal(specification.diagram_type, "workflow");
  assert.equal(specification.meta.legend.mode, "hidden");
  assert.deepEqual([...new Set(specification.nodes.map((node) => node.type))], ["backend"]);
  assert.deepEqual(specification.nodes.map(({ col }) => col), [0, 1]);
  assert.equal(specification.edges.length, 1);
  assert.match(specification.cards[1].items.join("\n"), /01 建立任务图/);
  assert.match(specification.cards[1].items.join("\n"), /02 展示本地视图/);
});

test("workflow adapter isolates feature errors and keeps a validated six-layer overview for long plans", () => {
  const task = (feature, index) => ({ id: `${feature}/${index}`, localId: String(index), feature, title: `任务 ${index}`, phase: "实现", status: "ready", dependsOn: index === 1 ? [] : [`${feature}/${index - 1}`] });
  const alpha = Array.from({ length: 13 }, (_, index) => task("alpha", index + 1));
  const graph = {
    errors: [{ code: "invalid_status", path: "/repo/.scratch/beta/issues/01.md" }],
    tasks: [...alpha, task("beta", 1)],
    edges: alpha.slice(1).map((entry, index) => ({ from: alpha[index].id, to: entry.id })),
    specs: [],
  };

  const specification = workflowSpecification(graph, "alpha");
  assert.equal(specification.nodes.length, 6);
  assert.ok(specification.nodes.every(({ col }) => col >= 0 && col <= 5));
  assert.match(specification.cards[0].items.join("\n"), /图中显示前 6 项/);
  assert.equal(specification.cards[1].items.length, 13);
  assert.throws(() => workflowSpecification(graph, "beta"), /Task plan unavailable/);
});

test("Archify child process receives a credential-free environment", async () => {
  const source = await readFile(new URL("../src/workflow.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.\.\.process\.env/);
  assert.match(source, /\["LANG", "LC_ALL", "PATH", "TMPDIR"\]/);
});
