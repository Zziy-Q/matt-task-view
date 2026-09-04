import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createTaskViewServer } from "../src/server.mjs";

async function createTicket(root) {
  const issues = join(root, ".scratch", "demo", "issues");
  await mkdir(issues, { recursive: true });
  await writeFile(join(issues, "01-plan.md"), '---\nid: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\n---\n\n# Plan');
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function createArchitecture(root, feature, artifact = Buffer.from("<!doctype html><html lang=\"zh-CN\"><title>中文架构</title></html>")) {
  const directory = join(root, ".scratch", feature, "architecture");
  const specification = Buffer.from(JSON.stringify({
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "中文架构", locale: "zh-CN" },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  }));
  const specificationSha256 = digest(specification);
  const artifactSha256 = digest(artifact);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: true,
    mode: "greenfield",
    reason: "新增接口服务。",
    approvedSpecificationSha256: specificationSha256,
    approvedArtifactSha256: artifactSha256,
  }));
  await writeFile(join(directory, "system.architecture.json"), specification);
  await writeFile(join(directory, "system.architecture.html"), artifact);
  await writeFile(join(directory, "system.architecture.receipt.json"), JSON.stringify({
    schemaVersion: 1,
    ok: true,
    command: "deliver",
    type: "architecture",
    specification: { sha256: specificationSha256, bytes: specification.byteLength },
    artifact: { sha256: artifactSha256, bytes: artifact.byteLength },
    validation: { errors: 0, warnings: 0 },
  }));
  return { artifact, directory };
}

test("local server serves the task view and its public snapshot", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createTicket(root);
  const app = createTaskViewServer(root);
  const { url } = await app.listen();
  t.after(() => app.close());

  const [page, snapshot] = await Promise.all([fetch(url), fetch(`${url}api/snapshot`)]);

  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /<title>Matt Dev View · 本地 SDD 开发视图<\/title>/);
  const [styles, appScript] = await Promise.all([fetch(`${url}app.css`), fetch(`${url}app.js`)]);
  assert.match(styles.headers.get("content-type"), /text\/css/);
  assert.match(appScript.headers.get("content-type"), /javascript/);
  const script = await appScript.text();
  assert.match(script, /EventSource/);
  assert.match(script, /api\/snapshot/);
  assert.match(script, /showModal/);
  assert.ok((await styles.text()).length > 0);
  assert.equal((await fetch(`${url}favicon.ico`)).status, 204);
  assert.deepEqual((await snapshot.json()).summary, {
    total: 1,
    done: 0,
    progressPercent: 0,
    ready: 1,
    in_progress: 0,
    blocked: 0,
  });
});

test("local server returns a verified feature architecture with isolated browser permissions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const { artifact } = await createArchitecture(root, "中文功能");
  const app = createTaskViewServer(root);
  const { url } = await app.listen();
  t.after(() => app.close());

  const [page, response] = await Promise.all([
    fetch(url),
    fetch(`${url}architecture/${encodeURIComponent("中文功能")}/artifact.html?embed=1&theme=light`),
  ]);

  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), artifact);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("permissions-policy"), "clipboard-read=(), clipboard-write=(), fullscreen=()");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts");
  assert.match(page.headers.get("content-security-policy"), /frame-src 'self'/);
});

test("local server delivers the current feature workflow through pinned Archify", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createTicket(root);
  const app = createTaskViewServer(root);
  const { url } = await app.listen();
  t.after(() => app.close());

  const response = await fetch(`${url}workflow/demo/artifact.html?embed=1&theme=light`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts");
  const html = await response.text();
  assert.match(html, /Matt Task View|demo/);
  assert.match(html, /01/);
  assert.equal((await fetch(`${url}workflow/unknown/artifact.html`)).status, 404);
  assert.notEqual((await fetch(`${url}workflow/safe%2Fother/artifact.html`)).status, 200);
});

test("architecture route rejects encoded path attacks and feature directories that escape through a symlink", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createArchitecture(root, "safe");
  const outsideRoot = await mkdtemp(join(tmpdir(), "matt-task-view-outside-"));
  const outside = await createArchitecture(outsideRoot, "source");
  const escapingFeature = join(root, ".scratch", "escaping");
  await mkdir(escapingFeature, { recursive: true });
  await symlink(outside.directory, join(escapingFeature, "architecture"));
  const app = createTaskViewServer(root);
  const { url } = await app.listen();
  t.after(() => app.close());

  for (const path of [
    "architecture/%2e%2e/artifact.html",
    "architecture/safe%2Fother/artifact.html",
    "architecture/safe%5Cother/artifact.html",
    "architecture/safe%00/artifact.html",
    "architecture/%252e%252e/artifact.html",
    "architecture/safe%252Fother/artifact.html",
    "architecture/safe%255Cother/artifact.html",
    "architecture/safe%2500/artifact.html",
    "architecture/%/artifact.html",
    "architecture/safe/artifact.html/extra",
  ]) {
    assert.notEqual((await fetch(`${url}${path}`)).status, 200, path);
  }
  assert.notEqual((await fetch(`${url}architecture/escaping/artifact.html`)).status, 200);
});

test("architecture route serves the last-good HTML but safely rejects tampered or incomplete deliveries", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const stale = await createArchitecture(root, "stale");
  const tampered = await createArchitecture(root, "tampered");
  const missing = await createArchitecture(root, "missing");
  await writeFile(join(stale.directory, "system.architecture.json"), JSON.stringify({
    schema_version: 1,
    components: [{ id: "worker", type: "backend", label: "新任务执行器" }],
  }));
  await writeFile(join(tampered.directory, "system.architecture.html"), "<!doctype html><title>被修改</title>");
  await unlink(join(missing.directory, "system.architecture.receipt.json"));
  const app = createTaskViewServer(root);
  const { url } = await app.listen();
  t.after(() => app.close());

  const [staleResponse, tamperedResponse, missingResponse] = await Promise.all([
    fetch(`${url}architecture/stale/artifact.html`),
    fetch(`${url}architecture/tampered/artifact.html`),
    fetch(`${url}architecture/missing/artifact.html`),
  ]);

  assert.equal(staleResponse.status, 200);
  assert.deepEqual(Buffer.from(await staleResponse.arrayBuffer()), stale.artifact);
  assert.equal(tamperedResponse.status, 409);
  assert.equal(missingResponse.status, 404);
  for (const response of [tamperedResponse, missingResponse]) {
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-security-policy"), "default-src 'none'");
    assert.equal(response.headers.get("permissions-policy"), "clipboard-read=(), clipboard-write=(), fullscreen=()");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.doesNotMatch(await response.text(), new RegExp(root));
  }
});

test("local server notifies connected pages when tickets change", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createTicket(root);
  const app = createTaskViewServer(root);
  const { url } = await app.listen();
  t.after(() => app.close());

  const events = await fetch(`${url}events`);
  const reader = events.body.getReader();
  t.after(() => reader.cancel());
  await reader.read();
  await writeFile(join(root, ".scratch", "demo", "issues", "01-plan.md"), '---\nid: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\n---\n\n# Plan');

  const nextEvent = await Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for refresh event")), 1_000)),
  ]);

  assert.match(new TextDecoder().decode(nextEvent.value), /event: refresh/);
});
