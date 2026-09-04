# 架构记录契约

本契约由 companion 在正式规格完成后、`to-tickets` 前读取。文件由开发流程维护，Matt Dev View 只读校验。任务依赖图已内置 Archify；下述架构图命令同样使用仓库中的固定运行文件，不要求另装 Archify 或 npm 依赖。

## 1. 先记录架构影响

每个功能的决定保存到 `.scratch/<feature>/architecture/decision.json`。这四个字段均必填：`schemaVersion` 固定为 `1`，`required` 是布尔值，`mode` 是 `greenfield` 或 `existing`，`reason` 说明判断依据。

仅修改文档、样式等无架构影响工作时，可复制下面的完整示例，并把理由改为本次事实：

```json
{
  "schemaVersion": 1,
  "required": false,
  "mode": "existing",
  "reason": "仅完善使用说明，不改变组件、接口、数据流或部署结构。"
}
```

`required=false` 不需要图、回执、批准字段或票据架构绑定；非空跳过理由仍必需。缺少架构目录仅属于旧项目兼容状态，不等于完成显式判断。

需要新增组件、接口、数据流、信任边界、外部依赖或部署结构时，先记录待批准决定。例如一个新项目：

```json
{
  "schemaVersion": 1,
  "required": true,
  "mode": "greenfield",
  "reason": "新增本机页面和只读服务，需要确认组件边界。"
}
```

`greenfield` 从规划架构 v0 开始，不制造当前基线。`existing` 使用同样字段，但 `mode` 改为 `existing`；还需读取已验证的 `docs/architecture/`，把其 JSON 的真实 SHA-256 写入 `currentBaselineSpecificationSha256`。基线缺失或不能验证时，先恢复并由用户确认，不能随意填一个摘要绕过。

## 2. 用内置 Archify 校验与交付规划图

架构 JSON 保存为同目录的 `system.architecture.json`，遵循仓库内 `vendor/archify/schemas/architecture.schema.json`。下面仅是两组件的格式示例，实际项目需改为真实结构，稳定 `id` 用于后续票据 `affects`：

```json
{
  "schema_version": 1,
  "diagram_type": "architecture",
  "meta": { "title": "本机只读视图", "locale": "zh-CN" },
  "components": [
    { "id": "browser", "type": "frontend", "label": "本机页面", "pos": [40, 100], "size": [180, 80] },
    { "id": "server", "type": "backend", "label": "只读服务", "pos": [360, 100], "size": [180, 80] }
  ],
  "connections": [
    { "from": "browser", "to": "server", "label": "读取快照" }
  ]
}
```

从目标项目根目录执行，替换工具路径与功能目录。两个命令成功后，目录中应有决定、JSON、HTML、回执四件套：

```sh
matt_view_dir=/path/to/matt-task-view
matt_arch_dir=.scratch/example-feature/architecture
ARCHIFY_UPDATE_CHECK_DISABLED=1 node "$matt_view_dir/vendor/archify/bin/archify.mjs" validate architecture "$matt_arch_dir/system.architecture.json" --json
ARCHIFY_UPDATE_CHECK_DISABLED=1 node "$matt_view_dir/vendor/archify/bin/archify.mjs" deliver architecture "$matt_arch_dir/system.architecture.json" "$matt_arch_dir/system.architecture.html" --json > "$matt_arch_dir/system.architecture.receipt.json"
```

`deliver --json` 的标准输出就是要保存的回执；不要自行拼造回执。检查退出码为零且 `ok=true`，查看 `validation` 中的检查结果；失败时先修正诊断。命令禁用更新检查，不联网。需要 showcase 排版时，可给两个命令都追加 `--quality showcase`，并重新验证输出。

**工具校验通过不等于用户批准。** 在请求批准前，向用户展示实际图和本次两个精确摘要。用户明确批准后，才在 `decision.json` 增加：

| 批准字段 | 值来自哪里 |
| --- | --- |
| `approvedSpecificationSha256` | 本次成功回执的 `specification.sha256`，还须与当前 JSON 字节一致 |
| `approvedArtifactSha256` | 本次成功回执的 `artifact.sha256`，还须与当前 HTML 字节一致 |

没有用户批准时，保持这两个字段缺省。修改 JSON 或 HTML 后旧批准失效，重新交付并请求批准。规划门禁通过后，才发布工单：`architecture_revision` 使用已批准 JSON 的摘要，`affects` 使用真实组件 ID；任务顺序仍只写在 `depends_on`。

## 3. 实施完成后复核实际架构

全部工单 `done` 后，按实际代码生成 `.scratch/<feature>/architecture/actual/system.architecture.json`，对它执行同一组 `validate`、`deliver` 命令（将 `matt_arch_dir` 改为 actual 目录）。实际源与规划完全一致时可以保留相同字节；不能仅因工单完成就认定架构一致。

在 actual 目录创建 `decision.json`。下面是**待用户复核模板**；先替换功能名、理由和占位摘要。摘要必须来自当前已批准规划 JSON，不能保留占位文字：

```json
{
  "schemaVersion": 1,
  "recordType": "actual-review",
  "mode": "verification",
  "sourceFeature": "example-feature",
  "reason": "已逐项复核实际代码与规划，组件、接口及边界一致。",
  "plannedSpecificationSha256": "<当前已批准规划 JSON 的 64 位小写 SHA-256>",
  "differences": []
}
```

仅在复核确认无差异且实际源字节与规划一致时使用空 `differences`。有差异时，每项包含 `kind`（`added` / `changed` / `removed`）、`componentId`、`summary` 和 `rationale`，描述真实变更及原因；组件增删改必须与图一致。仅格式、位置或尺寸发生变化而组件关系未变时，当前校验器仍要求保留规划源的原字节；不要为通过校验虚构组件差异。

从项目根目录读取校验结果和待批准摘要，可复用服务的公开快照构建器。以下命令只输出数据，不写入批准：

```sh
node --input-type=module - "$matt_view_dir" <<'NODE'
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { buildTaskGraph } = await import(pathToFileURL(resolve(process.argv[2], 'src/task-graph.mjs')));
const graph = await buildTaskGraph(process.cwd());
for (const item of graph.architectures) {
  console.log(JSON.stringify({
    feature: item.feature,
    planning: { status: item.status, hashes: item.hashes },
    actual: item.actual
  }, null, 2));
}
NODE
```

实际记录通过交付与差异校验后，向用户展示 `actual` 中的复核说明、差异和三个当前摘要。用户明确批准后，**同时**写入 actual 决定的三个字段：

| 批准字段 | 精确取值 |
| --- | --- |
| `approvedSpecificationSha256` | `actual.hashes.currentSpecification` |
| `approvedArtifactSha256` | `actual.hashes.currentArtifact` |
| `approvedReviewSha256` | `actual.hashes.currentReview` |

`currentReview` 固定功能、理由、规划摘要、实际 JSON/HTML 摘要和差异清单，**不是整个 decision.json 文件的摘要**。不要手工猜算或使用工具“通过”替代批准。缺少任何一个批准字段、摘要不匹配、说明或差异改变，都不能视为已批准。

## 4. 提升长期基线

在实际复核已批准、全部工单完成后，由用户授权的外部流程将 actual 目录的四个文件逐字节提升为 `docs/architecture/` 基线。保留实际复核的 `sourceFeature`、批准摘要和回执；不要只复制图或复制后重新格式化 JSON。已有基线先核对来源与替换授权。

任务视图不会复制或批准，只读检查基线与 actual 的精确对应。它监听 `.scratch/` 和 `docs/architecture/`，修改后自动重新读取状态。架构状态变更不应被当作开发工单，也不会进入任务依赖图。
