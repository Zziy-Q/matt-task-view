import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildTaskGraph } from "../src/task-graph.mjs";

async function createTicket(root, feature, filename, frontmatter, body = "") {
  const issues = join(root, ".scratch", feature, "issues");
  await mkdir(issues, { recursive: true });
  await writeFile(
    join(issues, filename),
    `---\n${frontmatter}\n---\n\n# ${filename}\n\n${body}`,
  );
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("buildTaskGraph reads LF and CRLF Markdown as the same tasks and specification", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-markdown-newlines-"));
  await createTicket(root, "demo", "01.md", 'id: "01"\nstatus: done\ndepends_on: []\nphase: 实现', '- [x] 已验收\n- [~] 已实现\n- [ ] 待核对');
  await createTicket(root, "demo", "02.md", 'id: "02"\nstatus: ready\ndepends_on:\n  - "01"');
  const paths = ["spec.md", "issues/01.md", "issues/02.md"].map(path => join(root, ".scratch", "demo", path));
  await writeFile(paths[0], '# 功能规格\n\n## 目标\n第一行\n第二行\n\n## 方案\n方案内容\n');
  const lf = await buildTaskGraph(root);
  assert.deepEqual(lf.errors, []);
  assert.deepEqual(lf.frontier, ["demo/02"]);
  for (const path of paths) await writeFile(path, (await readFile(path, "utf8")).replaceAll("\n", "\r\n"));
  assert.deepEqual(await buildTaskGraph(root), lf);
});

test("architecture view marker preserves original tickets and dependency validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-architecture-view-"));
  await createTicket(root, "design", "01.md", 'id: "01"\nstatus: done\ndepends_on: []');
  await writeFile(join(root, ".scratch/design/spec.md"), '# Design\n\n**View:** architecture\n\n## Goal\nDesign reference');
  await createTicket(root, "product", "01.md", 'id: "01"\nstatus: ready\ndepends_on:\n  - "design/01"');
  const graph = await buildTaskGraph(root);
  assert.equal(graph.specs[0].view, "architecture");
  assert.equal(graph.tasks.length, 2);
  assert.deepEqual(graph.frontier, ["product/01"]);
  assert.deepEqual(graph.errors, []);
});

async function createArchitecture(root, feature, {
  approved = true,
  required = true,
  reason = "架构会改变。",
  architecture,
} = {}) {
  const directory = join(root, ".scratch", feature, "architecture");
  const specification = Buffer.from(JSON.stringify(architecture || {
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "中文架构", locale: "zh-CN" },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  }));
  const artifact = Buffer.from("<!doctype html><title>中文架构</title>");
  const specificationSha256 = digest(specification);
  const artifactSha256 = digest(artifact);
  const receipt = {
    schemaVersion: 1,
    ok: true,
    command: "deliver",
    type: "architecture",
    specification: { sha256: specificationSha256, bytes: specification.byteLength },
    artifact: { sha256: artifactSha256, bytes: artifact.byteLength },
    validation: { errors: 0, warnings: 0 },
  };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required,
    mode: "greenfield",
    reason,
    ...(approved ? {
      approvedSpecificationSha256: specificationSha256,
      approvedArtifactSha256: artifactSha256,
    } : {}),
  }));
  await writeFile(join(directory, "system.architecture.json"), specification);
  await writeFile(join(directory, "system.architecture.html"), artifact);
  await writeFile(join(directory, "system.architecture.receipt.json"), JSON.stringify(receipt));
  return { directory, specification, artifact, specificationSha256, artifactSha256, receipt };
}

async function createVerificationArchitecture(root, feature, plannedSpecificationSha256, {
  approved = false,
  baseline = false,
  sourceFeature = feature,
  validationErrors = 0,
  reason = "实现完成后的实际架构复核。",
  differences = [{ componentId: "api", kind: "changed", summary: "接口已落地", rationale: "与实现保持一致" }],
  architecture,
} = {}) {
  const directory = baseline
    ? join(root, "docs", "architecture")
    : join(root, ".scratch", feature, "architecture", "actual");
  const specification = Buffer.from(JSON.stringify(architecture || {
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "实际中文架构", locale: "zh-CN" },
    components: [{ id: "api", type: "backend", label: "实际接口服务" }],
  }));
  const artifact = Buffer.from("<!doctype html><title>实际中文架构</title>");
  const specificationSha256 = digest(specification);
  const artifactSha256 = digest(artifact);
  const reviewPayload = {
    sourceFeature,
    reason,
    plannedSpecificationSha256,
    actualSpecificationSha256: specificationSha256,
    actualArtifactSha256: artifactSha256,
    differences: differences.map(({ kind, componentId, summary, rationale }) => ({
      kind,
      componentId,
      summary,
      rationale,
    })),
  };
  const decision = {
    schemaVersion: 1,
    recordType: "actual-review",
    mode: "verification",
    sourceFeature,
    reason,
    plannedSpecificationSha256,
    differences,
    ...(approved ? {
      approvedSpecificationSha256: specificationSha256,
      approvedArtifactSha256: artifactSha256,
      approvedReviewSha256: digest(Buffer.from(JSON.stringify(reviewPayload))),
    } : {}),
  };
  const receipt = {
    schemaVersion: 1,
    ok: true,
    command: "deliver",
    type: "architecture",
    specification: { sha256: specificationSha256, bytes: specification.byteLength },
    artifact: { sha256: artifactSha256, bytes: artifact.byteLength },
    validation: { errors: validationErrors, warnings: 0 },
  };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "decision.json"), JSON.stringify(decision));
  await writeFile(join(directory, "system.architecture.json"), specification);
  await writeFile(join(directory, "system.architecture.html"), artifact);
  await writeFile(join(directory, "system.architecture.receipt.json"), JSON.stringify(receipt));
  return { directory, decision, specification, artifact, receipt, specificationSha256, artifactSha256 };
}

test("buildTaskGraph returns progress and the ready frontier for local tickets", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createTicket(root, "feature-a", "01-plan.md", 'id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\nphase: "计划"');
  await createTicket(root, "feature-a", "02-build.md", 'id: "02"\nstatus: ready\ndepends_on:\n  - "01"\nblocked_reason: ""\nphase: "实现"', "- [x] Install dependencies\n- [~] Implement the build\n- [ ] Run the build");

  const graph = await buildTaskGraph(root);

  assert.equal(graph.summary.total, 2);
  assert.equal(graph.summary.done, 1);
  assert.equal(graph.summary.progressPercent, 50);
  assert.deepEqual(graph.frontier, ["feature-a/02"]);
  assert.deepEqual(graph.tasks[1].acceptanceCriteria, [
    { text: "Install dependencies", state: "accepted" },
    { text: "Implement the build", state: "implemented" },
    { text: "Run the build", state: "pending" },
  ]);
});

test("buildTaskGraph includes the local SDD spec beside its tickets", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const featureRoot = join(root, ".scratch", "feature-a");
  await mkdir(featureRoot, { recursive: true });
  await writeFile(join(featureRoot, "spec.md"), "# Feature A\n\n## Problem Statement\n\nPeople cannot see delivery progress.\n\n## Solution\n\nShow a local task view.\n\n## Implementation Decisions\n\n- Read Markdown only.\n\n## Testing Decisions\n\n- Verify the snapshot.\n");

  const graph = await buildTaskGraph(root);

  assert.deepEqual(graph.specs, [{
    feature: "feature-a",
    path: join(featureRoot, "spec.md"),
    title: "Feature A",
    sections: {
      "Problem Statement": "People cannot see delivery progress.",
      Solution: "Show a local task view.",
      "Implementation Decisions": "- Read Markdown only.",
      "Testing Decisions": "- Verify the snapshot.",
    },
  }]);
});

test("buildTaskGraph publishes approved architecture facts and unlocks its ready ticket", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-build.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256}"\naffects:\n  - "api"`);

  const graph = await buildTaskGraph(root);
  const architecture = graph.architectures[0];

  assert.deepEqual(graph.frontier, ["feature-a/01"]);
  assert.deepEqual({
    feature: architecture.feature,
    path: architecture.path,
    required: architecture.required,
    mode: architecture.mode,
    reason: architecture.reason,
    status: architecture.status,
    developmentGatePassed: architecture.developmentGatePassed,
    artifactDisplayable: architecture.artifactDisplayable,
    nextStep: architecture.nextStep,
    lifecycle: { current: architecture.lifecycle.current, target: architecture.lifecycle.target },
    hashes: architecture.hashes,
    verification: architecture.verification,
    components: architecture.components,
  }, {
    feature: "feature-a",
    path: fixture.directory,
    required: true,
    mode: "greenfield",
    reason: "架构会改变。",
    status: "approved",
    developmentGatePassed: true,
    artifactDisplayable: true,
    nextStep: "架构已批准，可以进入任务计划。",
    lifecycle: { current: "absent", target: "approved" },
    hashes: {
      currentSpecification: fixture.specificationSha256,
      receiptSpecification: fixture.specificationSha256,
      approvedSpecification: fixture.specificationSha256,
      currentBaselineSpecification: null,
      currentArtifact: fixture.artifactSha256,
      receiptArtifact: fixture.artifactSha256,
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
  });
  assert.equal(architecture.workflowStatus, "approved");
  assert.equal(architecture.lifecycle.actual, "missing");
  assert.equal(architecture.lifecycle.baseline, "missing");
});

test("buildTaskGraph binds a ticket to its approved revision and Chinese component", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-build.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256.toUpperCase()}"\naffects:\n  - "api"`);

  const graph = await buildTaskGraph(root);
  const task = graph.tasks[0];

  assert.equal(task.architectureRevision, fixture.specificationSha256);
  assert.deepEqual(task.affects, ["api"]);
  assert.deepEqual(task.affectedComponents, [{ id: "api", type: "backend", label: "接口服务" }]);
  assert.equal(task.bindingStatus, "valid");
  assert.deepEqual(task.architectureDiagnostics, []);
  assert.deepEqual(graph.frontier, ["feature-a/01"]);
  assert.deepEqual(graph.edges, []);
});

test("buildTaskGraph diagnoses each invalid architecture binding without freezing valid tickets", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-missing.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');
  await createTicket(root, "feature-a", "02-invalid.md", 'id: "02"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "bad"\naffects: []');
  await createTicket(root, "feature-a", "03-unknown.md", `id: "03"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256}"\naffects:\n  - "missing-component"`);
  await createTicket(root, "feature-a", "04-valid.md", `id: "04"\nstatus: ready\ndepends_on:\n  - "01"\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256}"\naffects:\n  - "api"`);
  await createTicket(root, "feature-a", "05-stale-revision.md", `id: "05"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${"0".repeat(64)}"\naffects:\n  - "api"`);
  await createTicket(root, "feature-a", "06-independent-valid.md", `id: "06"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256}"\naffects:\n  - "api"`);

  const graph = await buildTaskGraph(root);
  const byId = Object.fromEntries(graph.tasks.map((task) => [task.localId, task]));

  assert.deepEqual(byId["01"].architectureDiagnostics.map(({ code }) => code), ["missing_architecture_revision", "missing_architecture_affects"]);
  assert.deepEqual(byId["02"].architectureDiagnostics.map(({ code }) => code), ["invalid_architecture_revision", "invalid_architecture_affects"]);
  assert.deepEqual(byId["03"].architectureDiagnostics.map(({ code }) => code), ["unknown_architecture_component"]);
  assert.deepEqual(byId["05"].architectureDiagnostics.map(({ code }) => code), ["architecture_revision_mismatch"]);
  assert.ok(byId["01"].architectureDiagnostics.every(({ path }) => path.endsWith("01-missing.md")));
  assert.equal(byId["04"].bindingStatus, "valid");
  assert.equal(byId["06"].bindingStatus, "valid");
  assert.deepEqual(graph.errors, []);
  assert.deepEqual(graph.frontier, ["feature-a/06"]);
  assert.deepEqual(graph.edges, [{ from: "feature-a/01", to: "feature-a/04" }]);
});

test("buildTaskGraph keeps stale ticket component IDs separate from changed architecture components", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-build.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256}"\naffects:\n  - "api"`);
  await writeFile(join(fixture.directory, "system.architecture.json"), JSON.stringify({
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "新架构", locale: "zh-CN" },
    components: [{ id: "worker", type: "backend", label: "新任务执行器" }],
  }));

  const graph = await buildTaskGraph(root);
  const task = graph.tasks[0];

  assert.equal(graph.architectures[0].status, "source_changed");
  assert.equal(graph.architectures[0].artifactDisplayable, true);
  assert.equal(task.architectureRevision, fixture.specificationSha256);
  assert.deepEqual(task.affects, ["api"]);
  assert.deepEqual(task.affectedComponents, []);
  assert.equal(task.bindingStatus, "unverifiable");
  assert.deepEqual(task.architectureDiagnostics.map(({ code }) => code), ["architecture_approval_unverifiable"]);
  assert.ok(task.architectureDiagnostics[0].path.endsWith("01-build.md"));
  assert.deepEqual(graph.frontier, []);
});

test("source-changed architecture locks ready work and pauses active work at a safe checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  for (const [id, status] of [["01", "ready"], ["02", "in_progress"], ["03", "done"]]) {
    await createTicket(root, "feature-a", `${id}-work.md`, `id: "${id}"\nstatus: ${status}\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256}"\naffects:\n  - "api"`);
  }
  await writeFile(join(fixture.directory, "system.architecture.json"), JSON.stringify({
    schema_version: 1,
    diagram_type: "architecture",
    components: [{ id: "worker", type: "backend", label: "新任务执行器" }],
  }));

  const graph = await buildTaskGraph(root);
  const byId = Object.fromEntries(graph.tasks.map((task) => [task.localId, task]));

  assert.equal(byId["01"].status, "ready");
  assert.deepEqual(byId["01"].architectureAction, {
    state: "locked",
    message: "架构批准已过期，重新批准前不可开始。",
  });
  assert.equal(byId["02"].status, "in_progress");
  assert.deepEqual(byId["02"].architectureAction, {
    state: "pause_at_safe_checkpoint",
    message: "架构批准已过期；完成当前安全检查点后暂停，重新批准后继续。",
  });
  assert.equal(byId["03"].status, "done");
  assert.equal(byId["03"].architectureAction, null);
  assert.equal(graph.architectures[0].artifactDisplayable, true);
  assert.deepEqual(graph.frontier, []);
  assert.deepEqual(graph.errors, []);
});

test("completed implementation waits for an independently verified actual architecture", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${fixture.specificationSha256}"\naffects:\n  - "api"`);

  const graph = await buildTaskGraph(root);
  const architecture = graph.architectures[0];

  assert.equal(architecture.status, "approved");
  assert.equal(architecture.workflowStatus, "actual_pending_review");
  assert.deepEqual(architecture.lifecycle, {
    current: "absent",
    target: "approved",
    actual: "missing",
    baseline: "missing",
  });
  assert.equal(architecture.implementationComplete, true);
  assert.equal(architecture.deliveryVerified, false);
  assert.equal(architecture.toolValidationPassed, false);
  assert.equal(architecture.userApproved, false);
  assert.equal(architecture.developmentGatePassed, true);
  assert.equal(architecture.artifactDisplayable, true);
  assert.match(architecture.nextStep, /实际架构/);
});

test("valid actual delivery keeps delivery, tool validation, and user approval as independent facts", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  const actual = await createVerificationArchitecture(root, "feature-a", planned.specificationSha256);

  const graph = await buildTaskGraph(root);
  const architecture = graph.architectures[0];

  assert.equal(architecture.status, "approved");
  assert.equal(architecture.workflowStatus, "actual_pending_review");
  assert.equal(architecture.implementationComplete, true);
  assert.equal(architecture.deliveryVerified, true);
  assert.equal(architecture.toolValidationPassed, true);
  assert.equal(architecture.userApproved, false);
  assert.equal(architecture.actual.status, "pending_review");
  assert.deepEqual(architecture.actual.differences, actual.decision.differences);
  assert.match(architecture.actual.reason, /实际架构复核/);
  assert.match(architecture.nextStep, /校验通过[^。]+复核规划与实际差异/);
  assert.doesNotMatch(architecture.nextStep, /修复.*校验问题/);
  assert.equal(architecture.actual.hashes.currentReview.length, 64);
  assert.equal(architecture.actual.hashes.approvedReview, null);

  const invalidToolRoot = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const secondPlan = await createArchitecture(invalidToolRoot, "feature-a");
  await createTicket(invalidToolRoot, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${secondPlan.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(invalidToolRoot, "feature-a", secondPlan.specificationSha256, {
    approved: true,
    validationErrors: 1,
  });

  const invalidTool = (await buildTaskGraph(invalidToolRoot)).architectures[0];
  assert.equal(invalidTool.deliveryVerified, true);
  assert.equal(invalidTool.toolValidationPassed, false);
  assert.equal(invalidTool.userApproved, true);
  assert.equal(invalidTool.status, "approved");
  assert.equal(invalidTool.workflowStatus, "actual_pending_review");
  assert.match(invalidTool.nextStep, /修复.*校验问题/);
});

test("explicit actual approval waits for an external baseline promotion without writing docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.status, "approved");
  assert.equal(architecture.workflowStatus, "baseline_pending");
  assert.equal(architecture.actual.status, "approved");
  assert.equal(architecture.userApproved, true);
  assert.match(architecture.nextStep, /外部流程/);
  await assert.rejects(access(join(root, "docs", "architecture")), { code: "ENOENT" });
});

test("an externally promoted exact four-file copy becomes the verified long-term baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  const actual = await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });
  const baselineDirectory = join(root, "docs", "architecture");
  await mkdir(baselineDirectory, { recursive: true });
  await writeFile(join(baselineDirectory, "decision.json"), JSON.stringify(actual.decision));
  await writeFile(join(baselineDirectory, "system.architecture.json"), actual.specification);
  await writeFile(join(baselineDirectory, "system.architecture.html"), actual.artifact);
  await writeFile(join(baselineDirectory, "system.architecture.receipt.json"), JSON.stringify(actual.receipt));

  const graph = await buildTaskGraph(root);
  const architecture = graph.architectures[0];

  assert.equal(graph.projectBaseline.status, "verified");
  assert.equal(graph.projectBaseline.verified, true);
  assert.equal(architecture.status, "approved");
  assert.equal(architecture.workflowStatus, "baseline_verified");
  assert.equal(architecture.lifecycle.baseline, "verified");
  assert.equal(architecture.baseline.status, "verified");
  assert.equal(architecture.baseline.internallyValid, true);
  assert.equal(architecture.baseline.copyMatchesActual, true);
  assert.match(architecture.nextStep, /精确一致/);
});

test("actual review approval fails closed after differences, source feature, or hashes change", async (t) => {
  for (const [name, mutate, expected] of [
    ["differences changed after approval", async (actual) => {
      await writeFile(join(actual.directory, "decision.json"), JSON.stringify({
        ...actual.decision,
        differences: [{ ...actual.decision.differences[0], rationale: "批准后被改写" }],
      }));
    }, "pending_review"],
    ["unsafe source feature", async (actual) => {
      await writeFile(join(actual.directory, "decision.json"), JSON.stringify({ ...actual.decision, sourceFeature: "../feature-a" }));
    }, "unverified"],
    ["planned hash mismatch", async (actual) => {
      await writeFile(join(actual.directory, "decision.json"), JSON.stringify({
        ...actual.decision,
        plannedSpecificationSha256: "0".repeat(64),
      }));
    }, "unverified"],
  ]) {
    await t.test(name, async () => {
      const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
      const planned = await createArchitecture(root, "feature-a");
      await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
      const actual = await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });
      await mutate(actual);

      const architecture = (await buildTaskGraph(root)).architectures[0];
      assert.equal(architecture.status, "approved");
      assert.equal(architecture.workflowStatus, "actual_pending_review");
      assert.equal(architecture.actual.status, expected);
      assert.equal(architecture.userApproved, false);
      assert.deepEqual(architecture.developmentGatePassed, true);
      assert.deepEqual(architecture.artifactDisplayable, true);
    });
  }
});

test("baseline verification separates internal validity, foreign ownership, and exact copy matching", async (t) => {
  for (const [name, baselineOptions, mutate, expectedStatus] of [
    ["tampered baseline artifact", {}, async (baseline) => {
      await writeFile(join(baseline.directory, "system.architecture.html"), "被篡改");
    }, "unverified"],
    ["baseline from another feature", { sourceFeature: "feature-b" }, async () => {}, "from_other_feature"],
  ]) {
    await t.test(name, async () => {
      const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
      const planned = await createArchitecture(root, "feature-a");
      await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
      await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });
      const baseline = await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
        approved: true,
        baseline: true,
        ...baselineOptions,
      });
      await mutate(baseline);

      const architecture = (await buildTaskGraph(root)).architectures[0];
      assert.equal(architecture.workflowStatus, "baseline_pending");
      assert.equal(architecture.baseline.status, expectedStatus);
      assert.equal(architecture.baseline.copyMatchesActual, false);
      assert.doesNotMatch(architecture.nextStep, /被篡改/);
    });
  }
});

test("an exact baseline cannot be verified before implementation is complete", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  const actual = await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });
  const baselineDirectory = join(root, "docs", "architecture");
  await mkdir(baselineDirectory, { recursive: true });
  await writeFile(join(baselineDirectory, "decision.json"), JSON.stringify(actual.decision));
  await writeFile(join(baselineDirectory, "system.architecture.json"), actual.specification);
  await writeFile(join(baselineDirectory, "system.architecture.html"), actual.artifact);
  await writeFile(join(baselineDirectory, "system.architecture.receipt.json"), JSON.stringify(actual.receipt));

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.implementationComplete, false);
  assert.equal(architecture.workflowStatus, "approved");
  assert.notEqual(architecture.baseline.status, "verified");
  assert.equal(architecture.exactCopyOfThisActual, true);
});

test("an unfinished source feature keeps its project baseline premature and cannot unlock existing work", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const sourcePlan = await createArchitecture(root, "source-feature");
  await createTicket(root, "source-feature", "01-work.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${sourcePlan.specificationSha256}"\naffects:\n  - "api"`);
  const actual = await createVerificationArchitecture(root, "source-feature", sourcePlan.specificationSha256, { approved: true });
  const baselineDirectory = join(root, "docs", "architecture");
  await mkdir(baselineDirectory, { recursive: true });
  await writeFile(join(baselineDirectory, "decision.json"), JSON.stringify(actual.decision));
  await writeFile(join(baselineDirectory, "system.architecture.json"), actual.specification);
  await writeFile(join(baselineDirectory, "system.architecture.html"), actual.artifact);
  await writeFile(join(baselineDirectory, "system.architecture.receipt.json"), JSON.stringify(actual.receipt));

  const existing = await createArchitecture(root, "existing-feature");
  await writeFile(join(existing.directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: true,
    mode: "existing",
    reason: "只在来源功能完成并正式提升基线后开始。",
    currentBaselineSpecificationSha256: actual.specificationSha256,
    approvedSpecificationSha256: existing.specificationSha256,
    approvedArtifactSha256: existing.artifactSha256,
  }));
  await createTicket(root, "existing-feature", "01-work.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${existing.specificationSha256}"\naffects:\n  - "api"`);

  const graph = await buildTaskGraph(root);
  const byFeature = Object.fromEntries(graph.architectures.map((architecture) => [architecture.feature, architecture]));

  assert.equal(graph.projectBaseline.status, "premature");
  assert.equal(graph.projectBaseline.verified, false);
  assert.equal(byFeature["source-feature"].implementationComplete, false);
  assert.notEqual(byFeature["source-feature"].baseline.status, "verified");
  assert.equal(byFeature["existing-feature"].lifecycle.current, "recovery_required");
  assert.equal(byFeature["existing-feature"].developmentGatePassed, false);
  assert.deepEqual(graph.frontier, ["source-feature/01"]);
});

test("canonical actual review approval ignores input property order but rejects partial approval", async (t) => {
  await t.test("property order", async () => {
    const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
    const planned = await createArchitecture(root, "feature-a");
    await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
    const actual = await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });
    const difference = actual.decision.differences[0];
    await writeFile(join(actual.directory, "decision.json"), JSON.stringify({
      ...actual.decision,
      differences: [{ rationale: difference.rationale, summary: difference.summary, componentId: difference.componentId, kind: difference.kind }],
    }));

    const architecture = (await buildTaskGraph(root)).architectures[0];
    assert.equal(architecture.userApproved, true);
    assert.equal(architecture.workflowStatus, "baseline_pending");
  });

  await t.test("partial approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
    const planned = await createArchitecture(root, "feature-a");
    await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
    const actual = await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });
    const { approvedReviewSha256, ...partialDecision } = actual.decision;
    await writeFile(join(actual.directory, "decision.json"), JSON.stringify(partialDecision));

    const architecture = (await buildTaskGraph(root)).architectures[0];
    assert.equal(architecture.actual.decisionValid, false);
    assert.equal(architecture.actual.status, "unverified");
    assert.equal(architecture.userApproved, false);
  });
});

test("actual differences must explain changed bytes with component-side semantics", async (t) => {
  for (const [name, differences] of [
    ["empty changed-byte review", []],
    ["added component exists on both sides", [{ componentId: "api", kind: "added", summary: "错误新增", rationale: "组件并非新增" }]],
    ["removed component still exists", [{ componentId: "api", kind: "removed", summary: "错误移除", rationale: "组件仍存在" }]],
  ]) {
    await t.test(name, async () => {
      const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
      const planned = await createArchitecture(root, "feature-a");
      await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
      await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true, differences });

      const architecture = (await buildTaskGraph(root)).architectures[0];
      assert.equal(architecture.actual.semanticDifferencesValid, false);
      assert.equal(architecture.actual.status, "unverified");
      assert.equal(architecture.userApproved, false);
      assert.equal(architecture.workflowStatus, "actual_pending_review");
    });
  }
});

test("actual differences reject an added component that is missing from the review", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      meta: { title: "实际中文架构", locale: "zh-CN" },
      components: [
        { id: "api", type: "backend", label: "实际接口服务" },
        { id: "worker", type: "backend", label: "异步任务" },
      ],
    },
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, false);
  assert.equal(architecture.actual.status, "unverified");
  assert.equal(architecture.userApproved, false);
});

test("actual differences reject a removed component that is missing from the review", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a", {
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      meta: { title: "中文架构", locale: "zh-CN" },
      components: [
        { id: "api", type: "backend", label: "接口服务" },
        { id: "worker", type: "backend", label: "异步任务" },
      ],
    },
  });
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, { approved: true });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, false);
  assert.equal(architecture.actual.status, "unverified");
  assert.equal(architecture.userApproved, false);
});

test("actual differences reject a changed component whose semantics did not change", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const component = { id: "api", type: "backend", label: "接口服务" };
  const planned = await createArchitecture(root, "feature-a", {
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      meta: { title: "规划架构", locale: "zh-CN" },
      components: [component],
    },
  });
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      meta: { title: "只改了全局标题", locale: "zh-CN" },
      components: [component],
    },
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, false);
  assert.equal(architecture.actual.status, "unverified");
  assert.equal(architecture.userApproved, false);
});

test("actual differences reject a declared change when planned and actual architecture are identical", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const identicalArchitecture = {
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "相同架构", locale: "zh-CN" },
    components: [{ id: "api", type: "backend", label: "接口服务" }],
  };
  const planned = await createArchitecture(root, "feature-a", { architecture: identicalArchitecture });
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: identicalArchitecture,
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, false);
  assert.equal(architecture.actual.status, "unverified");
  assert.equal(architecture.userApproved, false);
});

test("actual differences allow a changed component to explain its connection change", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const component = { id: "api", type: "backend", label: "接口服务" };
  const planned = await createArchitecture(root, "feature-a", {
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components: [component],
      connections: [{ from: "api", to: "api", label: "同步调用" }],
    },
  });
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components: [component],
      connections: [{ from: "api", to: "api", label: "异步调用" }],
    },
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, true);
  assert.equal(architecture.actual.status, "approved");
  assert.equal(architecture.userApproved, true);
});

test("actual differences reject an omitted component affected by a connection change", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const components = [
    { id: "api", type: "backend", label: "接口服务" },
    { id: "database", type: "database", label: "数据库" },
  ];
  const planned = await createArchitecture(root, "feature-a", {
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components,
      connections: [{ from: "api", to: "database", label: "同步写入" }],
    },
  });
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components,
      connections: [{ from: "api", to: "database", label: "异步写入" }],
    },
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, false);
  assert.equal(architecture.actual.status, "unverified");
  assert.equal(architecture.userApproved, false);
});

test("actual differences allow a changed component to explain its boundary change", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const component = { id: "api", type: "backend", label: "接口服务" };
  const planned = await createArchitecture(root, "feature-a", {
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components: [component],
      boundaries: [{ kind: "region", label: "公开区域", wraps: ["api"] }],
    },
  });
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components: [component],
      boundaries: [{ kind: "region", label: "受信区域", wraps: ["api"] }],
    },
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, true);
  assert.equal(architecture.actual.status, "approved");
  assert.equal(architecture.userApproved, true);
});

test("actual differences reject a changed component when only its layout changed", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a", {
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components: [{ id: "api", type: "backend", label: "接口服务", pos: [10, 20], size: [100, 60] }],
    },
  });
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components: [{ id: "api", type: "backend", label: "接口服务", pos: [40, 80], size: [180, 90] }],
    },
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, false);
  assert.equal(architecture.actual.status, "unverified");
  assert.equal(architecture.userApproved, false);
});

test("actual differences fail closed on malformed relationship collections", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const planned = await createArchitecture(root, "feature-a");
  await createTicket(root, "feature-a", "01-work.md", `id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${planned.specificationSha256}"\naffects:\n  - "api"`);
  await createVerificationArchitecture(root, "feature-a", planned.specificationSha256, {
    approved: true,
    architecture: {
      schema_version: 1,
      diagram_type: "architecture",
      components: [{ id: "api", type: "backend", label: "实际接口服务" }],
      connections: { from: "api", to: "api" },
    },
  });

  const architecture = (await buildTaskGraph(root)).architectures[0];

  assert.equal(architecture.actual.semanticDifferencesValid, false);
  assert.equal(architecture.actual.status, "unverified");
  assert.equal(architecture.userApproved, false);
});

test("project baseline remains independently verified after its source feature is cleaned up", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const plannedSha256 = "7".repeat(64);
  const baseline = await createVerificationArchitecture(root, "retired-feature", plannedSha256, {
    approved: true,
    baseline: true,
  });

  const graph = await buildTaskGraph(root);

  assert.deepEqual(graph.features, []);
  assert.equal(graph.projectBaseline.status, "verified");
  assert.equal(graph.projectBaseline.verified, true);
  assert.equal(graph.projectBaseline.sourceFeature, "retired-feature");
  assert.equal(graph.projectBaseline.hashes.currentSpecification, baseline.specificationSha256);
});

test("existing-system work requires a verified pinned current baseline while greenfield remains compatible", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const oldPlanned = "8".repeat(64);
  const baseline = await createVerificationArchitecture(root, "old-feature", oldPlanned, { approved: true, baseline: true });
  const existing = await createArchitecture(root, "existing-feature");
  await writeFile(join(existing.directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: true,
    mode: "existing",
    reason: "在已确认基线上规划变更。",
    currentBaselineSpecificationSha256: baseline.specificationSha256,
    approvedSpecificationSha256: existing.specificationSha256,
    approvedArtifactSha256: existing.artifactSha256,
  }));
  await createTicket(root, "existing-feature", "01-work.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${existing.specificationSha256}"\naffects:\n  - "api"`);
  const unpinned = await createArchitecture(root, "unpinned-feature");
  await writeFile(join(unpinned.directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: true,
    mode: "existing",
    reason: "尚未确认当前基线。",
    approvedSpecificationSha256: unpinned.specificationSha256,
    approvedArtifactSha256: unpinned.artifactSha256,
  }));
  await createTicket(root, "unpinned-feature", "01-work.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${unpinned.specificationSha256}"\naffects:\n  - "api"`);
  const greenfield = await createArchitecture(root, "greenfield-feature");
  await createTicket(root, "greenfield-feature", "01-work.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${greenfield.specificationSha256}"\naffects:\n  - "api"`);

  const graph = await buildTaskGraph(root);
  const byFeature = Object.fromEntries(graph.architectures.map((architecture) => [architecture.feature, architecture]));

  assert.equal(graph.projectBaseline.status, "verified");
  assert.equal(byFeature["existing-feature"].lifecycle.current, "confirmed");
  assert.equal(byFeature["existing-feature"].developmentGatePassed, true);
  assert.equal(byFeature["unpinned-feature"].lifecycle.current, "recovery_required");
  assert.equal(byFeature["unpinned-feature"].developmentGatePassed, false);
  assert.equal(byFeature["unpinned-feature"].workflowStatus, "current_baseline_required");
  assert.match(byFeature["unpinned-feature"].nextStep, /当前基线/);
  assert.equal(byFeature["greenfield-feature"].lifecycle.current, "absent");
  assert.deepEqual(graph.frontier, ["existing-feature/01", "greenfield-feature/01"]);
  assert.equal(byFeature["existing-feature"].baseline.status, "from_other_feature");
  assert.equal(byFeature["existing-feature"].baseline.sourceFeature, "old-feature");
});

test("buildTaskGraph accepts an explicit no-impact reason and leaves legacy features compatible", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const directory = join(root, ".scratch", "copy-change", "architecture");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: false,
    mode: "existing",
    reason: "只修改文案，不改变组件、接口、数据流或部署。",
  }));
  await createTicket(root, "copy-change", "01-copy.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');
  await createTicket(root, "legacy", "01-fix.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);

  assert.deepEqual(graph.frontier, ["copy-change/01", "legacy/01"]);
  assert.equal(graph.architectures.length, 1);
  assert.equal(graph.architectures[0].status, "not_required");
  assert.equal(graph.architectures[0].developmentGatePassed, true);
  assert.equal(graph.architectures[0].artifactDisplayable, false);
  const byFeature = Object.fromEntries(graph.tasks.map((task) => [task.feature, task]));
  assert.equal(byFeature["copy-change"].bindingStatus, "not_required");
  assert.deepEqual(byFeature["copy-change"].architectureDiagnostics, []);
  assert.equal(byFeature.legacy.bindingStatus, "legacy");
  assert.deepEqual(byFeature.legacy.architectureDiagnostics, []);
});

test("buildTaskGraph locks only the feature whose required architecture is pending or missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createArchitecture(root, "pending", { approved: false });
  const missing = await createArchitecture(root, "missing");
  await unlink(join(missing.directory, "system.architecture.receipt.json"));
  const approved = await createArchitecture(root, "approved");
  for (const feature of ["pending", "missing", "approved"]) {
    const metadata = feature === "approved" ? `\narchitecture_revision: "${approved.specificationSha256}"\naffects:\n  - "api"` : "";
    await createTicket(root, feature, "01-build.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""${metadata}`);
  }

  const graph = await buildTaskGraph(root);
  const byFeature = Object.fromEntries(graph.architectures.map((architecture) => [architecture.feature, architecture]));

  assert.deepEqual(graph.frontier, ["approved/01"]);
  assert.equal(byFeature.pending.status, "pending_approval");
  assert.equal(byFeature.missing.status, "missing");
  assert.equal(byFeature.pending.developmentGatePassed, false);
  assert.equal(byFeature.missing.developmentGatePassed, false);
  assert.deepEqual(graph.errors, []);
});

test("buildTaskGraph keeps a last-good artifact displayable after its architecture source changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await writeFile(join(fixture.directory, "system.architecture.json"), JSON.stringify({
    schema_version: 1,
    components: [{ id: "worker", type: "backend", label: "任务执行器" }],
  }));
  await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);
  const architecture = graph.architectures[0];

  assert.equal(architecture.status, "source_changed");
  assert.equal(architecture.artifactDisplayable, true);
  assert.equal(architecture.developmentGatePassed, false);
  assert.notEqual(architecture.hashes.currentSpecification, architecture.hashes.approvedSpecification);
  assert.deepEqual(graph.frontier, []);
});

test("buildTaskGraph does not display a receipt-matched artifact without a valid decision and architecture source", async (t) => {
  const invalidSources = [
    ["missing decision", async ({ directory }) => unlink(join(directory, "decision.json"))],
    ["malformed decision", async ({ directory }) => writeFile(join(directory, "decision.json"), "{")],
    ["missing specification", async ({ directory }) => unlink(join(directory, "system.architecture.json"))],
    ["malformed specification", async ({ directory }) => writeFile(join(directory, "system.architecture.json"), "{")],
    ["invalid specification structure", async ({ directory }) => writeFile(join(directory, "system.architecture.json"), JSON.stringify({ schema_version: 1 }))],
  ];

  for (const [name, invalidate] of invalidSources) {
    await t.test(name, async () => {
      const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
      const fixture = await createArchitecture(root, "feature-a");
      await invalidate(fixture);
      await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

      const graph = await buildTaskGraph(root);

      assert.equal(graph.architectures[0].artifactDisplayable, false);
      assert.equal(graph.architectures[0].developmentGatePassed, false);
      assert.deepEqual(graph.frontier, []);
    });
  }
});

test("buildTaskGraph rejects architecture components without unique non-empty string IDs and labels", async (t) => {
  const invalidComponents = [
    ["empty values", [{ id: "", type: "backend", label: "  " }]],
    ["non-string values", [{ id: 7, type: "backend", label: true }]],
    ["duplicate IDs", [{ id: "api", type: "backend", label: "接口服务" }, { id: "api", type: "worker", label: "任务执行器" }]],
  ];

  for (const [name, components] of invalidComponents) {
    await t.test(name, async () => {
      const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
      const fixture = await createArchitecture(root, "feature-a");
      const specification = Buffer.from(JSON.stringify({
        schema_version: 1,
        diagram_type: "architecture",
        meta: { title: "无效组件架构", locale: "zh-CN" },
        components,
      }));
      const specificationSha256 = digest(specification);
      await writeFile(join(fixture.directory, "system.architecture.json"), specification);
      await writeFile(join(fixture.directory, "system.architecture.receipt.json"), JSON.stringify({
        ...fixture.receipt,
        specification: { sha256: specificationSha256, bytes: specification.byteLength },
      }));
      await writeFile(join(fixture.directory, "decision.json"), JSON.stringify({
        schemaVersion: 1,
        required: true,
        mode: "greenfield",
        reason: "架构会改变。",
        approvedSpecificationSha256: specificationSha256,
        approvedArtifactSha256: fixture.artifactSha256,
      }));
      await createTicket(root, "feature-a", "01-build.md", `id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""\narchitecture_revision: "${specificationSha256}"\naffects:\n  - "api"`);

      const graph = await buildTaskGraph(root);

      assert.equal(graph.architectures[0].status, "unverified");
      assert.equal(graph.architectures[0].artifactDisplayable, false);
      assert.equal(graph.architectures[0].developmentGatePassed, false);
      assert.deepEqual(graph.architectures[0].components, []);
      assert.equal(graph.tasks[0].bindingStatus, "unverifiable");
      assert.deepEqual(graph.tasks[0].architectureDiagnostics.map(({ code }) => code), ["architecture_approval_unverifiable"]);
      assert.deepEqual(graph.frontier, []);
    });
  }
});

test("buildTaskGraph rejects a tampered artifact even when its architecture source is unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await writeFile(join(fixture.directory, "system.architecture.html"), "<!doctype html><title>被修改</title>");
  await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);
  const architecture = graph.architectures[0];

  assert.equal(architecture.status, "artifact_tampered");
  assert.equal(architecture.artifactDisplayable, false);
  assert.equal(architecture.developmentGatePassed, false);
  assert.deepEqual(graph.frontier, []);
});

test("buildTaskGraph treats malformed delivery receipts and empty skip reasons as unverified", async (t) => {
  const invalidReceipts = [
    { schemaVersion: 2 },
    { schemaVersion: 1, ok: false, command: "deliver", type: "architecture" },
    { schemaVersion: 1, ok: true, command: "validate", type: "architecture" },
    { schemaVersion: 1, ok: true, command: "deliver", type: "diagram" },
    { schemaVersion: 1, ok: true, command: "deliver", type: "architecture", specification: { sha256: "bad", bytes: -1 }, artifact: { sha256: "bad", bytes: -1 } },
  ];

  for (const [index, receipt] of invalidReceipts.entries()) {
    await t.test(`invalid receipt ${index + 1}`, async () => {
      const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
      const fixture = await createArchitecture(root, "feature-a");
      await writeFile(join(fixture.directory, "system.architecture.receipt.json"), JSON.stringify(receipt));
      await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

      const graph = await buildTaskGraph(root);

      assert.equal(graph.architectures[0].status, "unverified");
      assert.equal(graph.architectures[0].verification.receiptValid, false);
      assert.equal(graph.architectures[0].artifactDisplayable, false);
      assert.deepEqual(graph.frontier, []);
    });
  }

  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createArchitecture(root, "feature-a", { required: false, reason: "" });
  await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');
  const graph = await buildTaskGraph(root);
  assert.equal(graph.architectures[0].status, "unverified");
  assert.deepEqual(graph.frontier, []);
});

test("buildTaskGraph asks for a non-empty reason when a decision-only feature skips architecture", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const directory = join(root, ".scratch", "feature-a", "architecture");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: false,
    mode: "existing",
    reason: "",
  }));
  await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);

  assert.equal(graph.architectures[0].status, "unverified");
  assert.equal(graph.architectures[0].nextStep, "请填写非空的无架构影响理由。");
  assert.equal(graph.architectures[0].artifactDisplayable, false);
  assert.deepEqual(graph.frontier, []);
});

test("invalid no-impact decisions name the invalid field without asking for architecture artifacts", async (t) => {
  for (const [field, value] of [["schemaVersion", undefined], ["mode", "unknown"], ["required", "false"], ["reason", null], ["approvedSpecificationSha256", "bad"]]) {
    await t.test(field, async () => {
      const root = await mkdtemp(join(tmpdir(), "matt-decision-diagnostic-"));
      const directory = join(root, ".scratch", "demo", "architecture");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "decision.json"), JSON.stringify({ schemaVersion: 1, mode: "existing", required: false, reason: "只修改文案。", [field]: value }));
      await createTicket(root, "demo", "01.md", 'id: "01"\nstatus: ready\ndepends_on: []');
      const graph = await buildTaskGraph(root);
      assert.match(graph.architectures[0].nextStep, new RegExp(field));
      assert.doesNotMatch(graph.architectures[0].nextStep, /HTML|交付回执/);
      assert.equal(graph.architectures[0].developmentGatePassed, false);
      assert.equal(graph.architectures[0].artifactDisplayable, false);
      assert.deepEqual(graph.frontier, []);
    });
  }
});

test("buildTaskGraph requires an approved artifact hash when the decision records one", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await writeFile(join(fixture.directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: true,
    mode: "greenfield",
    reason: "架构会改变。",
    approvedSpecificationSha256: fixture.specificationSha256,
    approvedArtifactSha256: "0".repeat(64),
  }));
  await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);

  assert.equal(graph.architectures[0].status, "source_changed");
  assert.equal(graph.architectures[0].developmentGatePassed, false);
  assert.deepEqual(graph.frontier, []);
});

test("buildTaskGraph rejects a present but malformed approval hash", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const fixture = await createArchitecture(root, "feature-a");
  await writeFile(join(fixture.directory, "decision.json"), JSON.stringify({
    schemaVersion: 1,
    required: true,
    mode: "greenfield",
    reason: "架构会改变。",
    approvedSpecificationSha256: "",
  }));
  await createTicket(root, "feature-a", "01-build.md", 'id: "01"\nstatus: ready\ndepends_on: []\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);

  assert.equal(graph.architectures[0].status, "unverified");
  assert.deepEqual(graph.frontier, []);
});

test("buildTaskGraph supports cross-feature dependencies and reports invalid plans", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  await createTicket(root, "foundation", "01-core.md", 'id: "01"\nstatus: done\ndepends_on: []\nblocked_reason: ""');
  await createTicket(root, "dashboard", "01-ui.md", 'id: "01"\nstatus: ready\ndepends_on:\n  - "foundation/01"\nblocked_reason: ""');
  await createTicket(root, "dashboard", "02-bad.md", 'id: "02"\nstatus: blocked\ndepends_on:\n  - "99"\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);

  assert.deepEqual(graph.frontier, []);
  assert.deepEqual(
    graph.errors.map((error) => error.code).sort(),
    ["missing_blocked_reason", "missing_dependency"],
  );
  assert.equal(graph.tasks.find((task) => task.id === "dashboard/01").dependsOn[0], "foundation/01");
});

test("buildTaskGraph returns an empty, valid graph when no local tickets exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));

  const graph = await buildTaskGraph(root);

  assert.deepEqual(graph.errors, []);
  assert.equal(graph.summary.total, 0);
  assert.equal(graph.summary.progressPercent, 0);
  assert.deepEqual(graph.frontier, []);
});

test("buildTaskGraph locates malformed tickets and dependency cycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "matt-task-view-"));
  const issues = join(root, ".scratch", "feature", "issues");
  await mkdir(issues, { recursive: true });
  await writeFile(join(issues, "00-legacy.md"), "# Legacy ticket");
  await createTicket(root, "feature", "01-a.md", 'id: "01"\nstatus: ready\ndepends_on:\n  - "02"\nblocked_reason: ""');
  await createTicket(root, "feature", "02-b.md", 'id: "02"\nstatus: ready\ndepends_on:\n  - "01"\nblocked_reason: ""');
  await createTicket(root, "feature", "03-self.md", 'id: "03"\nstatus: ready\ndepends_on:\n  - "03"\nblocked_reason: ""');

  const graph = await buildTaskGraph(root);
  const codes = graph.errors.map((error) => error.code);

  assert.ok(codes.includes("missing_frontmatter"));
  assert.ok(codes.includes("dependency_cycle"));
  assert.ok(codes.includes("self_dependency"));
  assert.equal(graph.frontier.length, 0);
});
