import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

test("companion places the architecture gate after the formal spec and before ticket publication", async () => {
  const skill = await text("skills/matt-task-view/SKILL.md");

  assert.match(skill, /^description:.*formal spec.*architecture-impact gate.*before \/to-tickets/m);
  const formalSpec = skill.indexOf("正式规格完成");
  const impactGate = skill.indexOf("架构影响判断");
  const ticketPublication = skill.indexOf("`/to-tickets`");
  assert.ok(formalSpec >= 0 && impactGate > formalSpec && ticketPublication > impactGate);
  assert.match(skill, /required=false[^\n]+非空[^\n]+理由/);
  assert.match(skill, /greenfield[^\n]+规划架构 v0/);
  assert.match(skill, /existing[^\n]+currentBaselineSpecificationSha256/);
  assert.match(skill, /validate[^\n]+deliver/);
  assert.match(skill, /工具校验[^\n]+不等于[^\n]+用户批准/);
  assert.match(skill, /门禁[^\n]+不得发布[^\n]+issues/);
});

test("ticket contract keeps architecture traceability separate from the task dependency DAG", async () => {
  const contract = await text("skills/matt-task-view/references/ticket-contract.md");

  assert.match(contract, /architecture_revision[^\n]+64[^\n]+SHA-256/);
  assert.match(contract, /affects[^\n]+稳定组件 ID/);
  assert.match(contract, /affects[^\n]+不[^\n]+depends_on/);
  assert.match(contract, /required=false[^\n]+不[^\n]+architecture_revision[^\n]+affects/);
  assert.equal(contract.match(/Acceptance criteria use three local Markdown markers:/g)?.length, 1);
});

test("local tracker documents the architecture gate and the automatic same-turn sidebar handoff", async () => {
  const tracker = await text("docs/agents/issue-tracker.md");

  assert.match(tracker, /spec\.md[^\n]+architecture[^\n]+issues/);
  assert.match(tracker, /门禁未通过[^\n]+不得[^\n]+issues/);
  assert.match(tracker, /ticket-contract\.md[^\n]+decision\.json/);
  assert.match(tracker, /required=false[^\n]+理由非空/);
  assert.match(tracker, /required=true[^\n]+当前摘要[^\n]+用户批准摘要/);
  assert.match(tracker, /任一条件失败[^\n]+不发布部分票据/);
  assert.match(tracker, /architecture_revision[^\n]+affects[^\n]+depends_on/);
  assert.match(tracker, /to-tickets[^\n]+首次 implement/);
  assert.match(tracker, /127\.0\.0\.1[^\n]+open_in_codex[^\n]+right/);
});

test("companion documents safe implementation closure without giving the task view write authority", async () => {
  const skill = await text("skills/matt-task-view/SKILL.md");

  assert.match(skill, /source_changed|事实源在实施中变化/);
  assert.match(skill, /in_progress[^\n]+安全检查点[^\n]+暂停/);
  assert.match(skill, /全部工单 done[^\n]+actual/);
  assert.match(skill, /recordType="actual-review"/);
  for (const field of ["approvedSpecificationSha256", "approvedArtifactSha256", "approvedReviewSha256"]) {
    assert.match(skill, new RegExp(field));
  }
  assert.match(skill, /外部流程[^\n]+复制[^\n]+docs\/architecture/);
  assert.match(skill, /任务视图只读验证[^\n]+不创建目录[^\n]+不复制文件/);
});

test("README gives a short architecture-first local flow without duplicating the JSON schema", async () => {
  const readme = await text("README.md");

  const flow = readme.split("## 本地开发流程\n")[1]?.split("\n## ")[0] ?? "";
  const spec = flow.indexOf("正式规格");
  const architecture = flow.indexOf("架构影响");
  const tickets = flow.indexOf("to-tickets");
  assert.ok(spec >= 0 && architecture > spec && tickets > architecture);
  assert.match(readme, /greenfield[^\n]+规划架构 v0/);
  assert.match(readme, /existing[^\n]+当前基线/);
  assert.match(readme, /actual[^\n]+长期基线/);
  assert.doesNotMatch(readme, /approvedReviewSha256/);
});
