import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const STATUSES = new Set(["ready", "in_progress", "blocked", "done"]);

function diagnostic(code, message, path) {
  return { code, message, path };
}

function parseFrontmatter(source, path) {
  if (!source.startsWith("---\n")) {
    return { error: diagnostic("missing_frontmatter", "Ticket must start with YAML frontmatter.", path) };
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    return { error: diagnostic("invalid_frontmatter", "Ticket frontmatter is not closed.", path) };
  }

  const values = {};
  let listKey;
  for (const line of source.slice(4, end).split("\n")) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && listKey) {
      values[listKey].push(unquote(listMatch[1].trim()));
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (rawValue === "") {
      values[key] = [];
      listKey = key;
    } else {
      values[key] = rawValue === "[]" ? [] : unquote(rawValue);
      listKey = undefined;
    }
  }

  return { values, body: source.slice(end + 4) };
}

function unquote(value) {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

function ticketFromSource(source, { feature, path }) {
  const parsed = parseFrontmatter(source, path);
  if (parsed.error) return { error: parsed.error };

  const { values, body } = parsed;
  const errors = [];
  if (typeof values.id !== "string" || values.id.length === 0) {
    errors.push(diagnostic("missing_id", "Ticket frontmatter must contain a non-empty id.", path));
  }
  if (!STATUSES.has(values.status)) {
    errors.push(diagnostic("invalid_status", "Ticket status must be ready, in_progress, blocked, or done.", path));
  }
  if (!Array.isArray(values.depends_on)) {
    errors.push(diagnostic("invalid_dependencies", "Ticket depends_on must be a YAML list.", path));
  }
  if (values.status === "blocked" && (typeof values.blocked_reason !== "string" || !values.blocked_reason.trim())) {
    errors.push(diagnostic("missing_blocked_reason", "Blocked tickets must include blocked_reason.", path));
  }
  if (typeof values.id !== "string" || values.id.length === 0 || !STATUSES.has(values.status) || !Array.isArray(values.depends_on)) {
    return { errors };
  }

  const rawTitle = body.match(/^#\s+(.+)$/m)?.[1]?.trim() || values.id;
  const title = rawTitle.startsWith(`${values.id}: `) ? rawTitle.slice(values.id.length + 2) : rawTitle;
  const acceptanceCriteria = [...body.matchAll(/^- \[([ xX~])\]\s+(.+)$/gm)].map((match) => ({
    text: match[2].trim(),
    state: match[1].toLowerCase() === "x" ? "accepted" : match[1] === "~" ? "implemented" : "pending",
  }));
  return {
    errors,
    task: {
      id: `${feature}/${values.id}`,
      localId: values.id,
      feature,
      phase: typeof values.phase === "string" && values.phase.trim() ? values.phase : "未分阶段",
      title,
      status: values.status,
      blockedReason: typeof values.blocked_reason === "string" ? values.blocked_reason : "",
      dependsOn: values.depends_on.map((dependency) => dependency.includes("/") ? dependency : `${feature}/${dependency}`),
      architectureRevision: typeof values.architecture_revision === "string" ? values.architecture_revision.toLowerCase() : null,
      affects: Array.isArray(values.affects) ? values.affects : [],
      affectedComponents: [],
      bindingStatus: "legacy",
      architectureDiagnostics: [],
      architectureAction: null,
      acceptanceCriteria,
      path,
    },
    architectureMetadata: {
      revision: values.architecture_revision,
      affects: values.affects,
    },
  };
}

async function featureDirectories(scratchRoot) {
  try {
    const entries = await readdir(scratchRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function issueFiles(issueDirectory) {
  try {
    const entries = await readdir(issueDirectory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function specFromSource(source, { feature, path }) {
  const title = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || feature;
  const headings = [...source.matchAll(/^##\s+(.+?)\s*$/gm)];
  const sections = Object.fromEntries(headings.map((heading, index) => [
    heading[1].trim(),
    source.slice(heading.index + heading[0].length, headings[index + 1]?.index).trim(),
  ]).filter(([, content]) => content));
  return { feature, path, title, sections, ...(/^\*\*View:\*\* architecture\s*$/m.test(source.split(/^##\s/m)[0]) ? { view: "architecture" } : {}) };
}

async function featureSpec(featureRoot, feature) {
  const path = join(featureRoot, "spec.md");
  try {
    return specFromSource(await readFile(path, "utf8"), { feature, path });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function optionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function sha256(value) {
  return value && createHash("sha256").update(value).digest("hex");
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

const SHA256 = /^[a-f0-9]{64}$/;

function validOptionalSha256(value) {
  return value === undefined || SHA256.test(value);
}

function validDecision(value) {
  return value?.schemaVersion === 1
    && typeof value.required === "boolean"
    && ["greenfield", "existing"].includes(value.mode)
    && typeof value.reason === "string"
    && validOptionalSha256(value.currentBaselineSpecificationSha256)
    && validOptionalSha256(value.approvedSpecificationSha256)
    && validOptionalSha256(value.approvedArtifactSha256);
}

function validReceipt(value) {
  return value?.schemaVersion === 1
    && value.ok === true
    && value.command === "deliver"
    && value.type === "architecture"
    && SHA256.test(value.specification?.sha256 || "")
    && Number.isInteger(value.specification?.bytes)
    && value.specification.bytes >= 0
    && SHA256.test(value.artifact?.sha256 || "")
    && Number.isInteger(value.artifact?.bytes)
    && value.artifact.bytes >= 0;
}

function validArchitectureSpecification(value) {
  if (!value || !Array.isArray(value.components)) return false;
  for (const key of ["connections", "boundaries"]) {
    if (value[key] !== undefined
      && (!Array.isArray(value[key])
        || value[key].some((item) => !item || typeof item !== "object" || Array.isArray(item)))) return false;
  }
  const ids = new Set();
  return value.components.every((component) => {
    if (typeof component?.id !== "string" || !component.id.trim()
      || typeof component.label !== "string" || !component.label.trim()
      || ids.has(component.id)) return false;
    ids.add(component.id);
    return true;
  });
}

function validDifferences(value) {
  return Array.isArray(value) && value.every((difference) =>
    ["added", "changed", "removed"].includes(difference?.kind)
      && typeof difference.componentId === "string" && Boolean(difference.componentId.trim())
      && typeof difference.summary === "string" && Boolean(difference.summary.trim())
      && typeof difference.rationale === "string" && Boolean(difference.rationale.trim()));
}

function validVerificationDecision(value) {
  const approvals = [
    value?.approvedSpecificationSha256,
    value?.approvedArtifactSha256,
    value?.approvedReviewSha256,
  ];
  const approvalsAllOrNone = approvals.every((value) => value === undefined)
    || approvals.every((value) => value !== undefined);
  return value?.schemaVersion === 1
    && value.recordType === "actual-review"
    && value.mode === "verification"
    && typeof value.sourceFeature === "string" && Boolean(value.sourceFeature.trim())
    && typeof value.reason === "string" && Boolean(value.reason.trim())
    && SHA256.test(value.plannedSpecificationSha256 || "")
    && validDifferences(value.differences)
    && validOptionalSha256(value.approvedSpecificationSha256)
    && validOptionalSha256(value.approvedArtifactSha256)
    && validOptionalSha256(value.approvedReviewSha256)
    && approvalsAllOrNone;
}

function safeSourceFeature(value) {
  return typeof value === "string" && Boolean(value.trim())
    && value !== "." && value !== ".."
    && !/[\\/\0]/.test(value);
}

async function verificationSources(path) {
  const [decisionSource, specificationSource, artifactSource, receiptSource] = await Promise.all([
    optionalFile(join(path, "decision.json")),
    optionalFile(join(path, "system.architecture.json")),
    optionalFile(join(path, "system.architecture.html")),
    optionalFile(join(path, "system.architecture.receipt.json")),
  ]);
  return { decisionSource, specificationSource, artifactSource, receiptSource };
}

function deliveredBundle(sources) {
  const { specificationSource, artifactSource, receiptSource } = sources;
  const specification = parseJson(specificationSource);
  const receipt = parseJson(receiptSource);
  const receiptValid = validReceipt(receipt);
  const specificationValid = validArchitectureSpecification(specification);
  const currentSpecification = sha256(specificationSource);
  const currentArtifact = sha256(artifactSource);
  const specificationMatches = Boolean(receiptValid && specificationSource
    && currentSpecification === receipt.specification.sha256
    && specificationSource.byteLength === receipt.specification.bytes);
  const artifactBytesMatch = Boolean(receiptValid && artifactSource
    && artifactSource.byteLength === receipt.artifact.bytes);
  const artifactMatches = Boolean(receiptValid && artifactSource
    && currentArtifact === receipt.artifact.sha256 && artifactBytesMatch);
  return {
    sources: { specificationSource, artifactSource, receiptSource },
    specification,
    public: {
      deliveryVerified: specificationValid && specificationMatches && artifactMatches,
      toolValidationPassed: receiptValid && receipt?.validation?.errors === 0,
      hashes: {
        currentSpecification,
        receiptSpecification: receipt?.specification?.sha256 || null,
        currentArtifact,
        receiptArtifact: receipt?.artifact?.sha256 || null,
      },
      verification: {
        receiptValid,
        specificationValid,
        specificationMatches,
        artifactMatches,
        artifactBytesMatch,
        toolValidation: receipt?.validation || null,
      },
      components: specificationValid
        ? specification.components.map(({ id, type, label }) => ({ id, type, label }))
        : [],
    },
  };
}

function reviewSha256(decision, bundle) {
  if (!decision || !bundle.hashes.currentSpecification || !bundle.hashes.currentArtifact
    || !validDifferences(decision.differences)) return null;
  return sha256(Buffer.from(JSON.stringify({
    sourceFeature: decision.sourceFeature,
    reason: decision.reason,
    plannedSpecificationSha256: decision.plannedSpecificationSha256,
    actualSpecificationSha256: bundle.hashes.currentSpecification,
    actualArtifactSha256: bundle.hashes.currentArtifact,
    differences: decision.differences.map(({ kind, componentId, summary, rationale }) => ({
      kind,
      componentId,
      summary,
      rationale,
    })),
  })));
}

function semanticProjection(value) {
  if (Array.isArray(value)) return value.map(semanticProjection);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => key !== "pos" && key !== "size")
    .sort()
    .map((key) => [key, semanticProjection(value[key])]));
}

function semanticSignature(value) {
  return JSON.stringify(semanticProjection(value));
}

function componentArchitectureSignature(specification, componentId) {
  const component = specification.components.find(({ id }) => id === componentId);
  const connections = (Array.isArray(specification.connections) ? specification.connections : [])
    .filter(({ from, to }) => from === componentId || to === componentId)
    .map(semanticSignature)
    .sort();
  const boundaries = (Array.isArray(specification.boundaries) ? specification.boundaries : [])
    .filter(({ wraps }) => Array.isArray(wraps) && wraps.includes(componentId))
    .map((boundary) => semanticSignature({
      ...boundary,
      wraps: [...boundary.wraps].sort(),
    }))
    .sort();
  return semanticSignature({ component, connections, boundaries });
}

function containsEveryExpectedIdOnce(declaredIds, expectedIds) {
  return declaredIds.length === expectedIds.size
    && new Set(declaredIds).size === declaredIds.length
    && declaredIds.every((id) => expectedIds.has(id));
}

function differencesMatchArchitecture(differences, plannedSpecification, actualSpecification, hashes) {
  if (!validArchitectureSpecification(plannedSpecification)
    || !validArchitectureSpecification(actualSpecification)) return false;
  if (hashes.currentSpecification !== hashes.plannedSpecification && differences.length === 0) return false;
  const plannedComponents = new Map((plannedSpecification?.components || []).map((component) => [component.id, component]));
  const actualComponents = new Map((actualSpecification?.components || []).map((component) => [component.id, component]));
  const plannedIds = new Set(plannedComponents.keys());
  const actualIds = new Set(actualComponents.keys());
  const expectedAdded = new Set([...actualIds].filter((id) => !plannedIds.has(id)));
  const expectedRemoved = new Set([...plannedIds].filter((id) => !actualIds.has(id)));
  const expectedChanged = new Set([...plannedIds].filter((id) => actualIds.has(id)
    && componentArchitectureSignature(plannedSpecification, id)
      !== componentArchitectureSignature(actualSpecification, id)));
  const declaredAdded = differences.filter(({ kind }) => kind === "added").map(({ componentId }) => componentId);
  const declaredRemoved = differences.filter(({ kind }) => kind === "removed").map(({ componentId }) => componentId);
  const declaredChanged = differences.filter(({ kind }) => kind === "changed").map(({ componentId }) => componentId);
  return containsEveryExpectedIdOnce(declaredAdded, expectedAdded)
    && containsEveryExpectedIdOnce(declaredRemoved, expectedRemoved)
    && containsEveryExpectedIdOnce(declaredChanged, expectedChanged);
}

async function verificationArchitecture(path, feature, plannedSpecificationSha256, plannedSpecification, {
  baseline = false,
  sources: providedSources,
} = {}) {
  const sources = providedSources || await verificationSources(path);
  const { decisionSource } = sources;
  const delivered = deliveredBundle(sources);
  const decision = parseJson(decisionSource);
  const schemaValid = validVerificationDecision(decision);
  const semanticDifferencesValid = schemaValid && differencesMatchArchitecture(
    decision.differences,
    plannedSpecification,
    delivered.specification,
    {
      currentSpecification: delivered.public.hashes.currentSpecification,
      plannedSpecification: plannedSpecificationSha256,
    },
  );
  const decisionValid = schemaValid && semanticDifferencesValid;
  const currentReview = reviewSha256(decision, delivered.public);
  const sourceSafe = decisionValid && safeSourceFeature(decision.sourceFeature);
  const sourceMatches = sourceSafe && decision.sourceFeature === feature;
  const plannedMatches = decisionValid
    && decision.plannedSpecificationSha256 === plannedSpecificationSha256;
  const approvalFieldsPresent = Boolean(decision?.approvedSpecificationSha256
    && decision?.approvedArtifactSha256 && decision?.approvedReviewSha256);
  const userApproved = Boolean(decisionValid && approvalFieldsPresent
    && decision.approvedSpecificationSha256 === delivered.public.hashes.currentSpecification
    && decision.approvedArtifactSha256 === delivered.public.hashes.currentArtifact
    && decision.approvedReviewSha256 === currentReview);
  const missing = !decisionSource || !delivered.sources.specificationSource
    || !delivered.sources.artifactSource || !delivered.sources.receiptSource;
  const internallyValid = decisionValid && sourceSafe && plannedMatches
    && delivered.public.deliveryVerified && delivered.public.toolValidationPassed;
  const valid = internallyValid && sourceMatches;
  const status = missing
    ? "missing"
    : baseline && internallyValid && !sourceMatches
      ? "foreign_feature"
      : !valid ? "unverified" : userApproved ? "approved" : "pending_review";
  return {
    sources,
    public: {
      path,
      status,
      decisionValid,
      semanticDifferencesValid,
      internallyValid,
      sourceSafe,
      sourceMatches,
      plannedMatches,
      deliveryVerified: delivered.public.deliveryVerified,
      toolValidationPassed: delivered.public.toolValidationPassed,
      userApproved,
      sourceFeature: typeof decision?.sourceFeature === "string" ? decision.sourceFeature : "",
      reason: typeof decision?.reason === "string" ? decision.reason : "",
      differences: validDifferences(decision?.differences) ? decision.differences : [],
      hashes: {
        ...delivered.public.hashes,
        approvedSpecification: decision?.approvedSpecificationSha256 || null,
        approvedArtifact: decision?.approvedArtifactSha256 || null,
        currentReview,
        approvedReview: decision?.approvedReviewSha256 || null,
      },
      verification: delivered.public.verification,
      components: delivered.public.components,
    },
  };
}

function sameVerificationDelivery(left, right) {
  return ["decisionSource", "specificationSource", "artifactSource", "receiptSource"]
    .every((key) => left.sources[key] && right.sources[key]
      && Buffer.compare(left.sources[key], right.sources[key]) === 0);
}

function projectBaselineSnapshot(path, sources) {
  const delivered = deliveredBundle(sources);
  const decision = parseJson(sources.decisionSource);
  const schemaValid = validVerificationDecision(decision);
  const differencesExplainBytes = schemaValid
    && (delivered.public.hashes.currentSpecification === decision.plannedSpecificationSha256
      || decision.differences.length > 0);
  const currentReview = reviewSha256(decision, delivered.public);
  const sourceSafe = schemaValid && safeSourceFeature(decision.sourceFeature);
  const userApproved = Boolean(schemaValid
    && decision.approvedSpecificationSha256 === delivered.public.hashes.currentSpecification
    && decision.approvedArtifactSha256 === delivered.public.hashes.currentArtifact
    && decision.approvedReviewSha256 === currentReview);
  const missing = Object.values(sources).some((value) => !value);
  const verified = !missing && sourceSafe && differencesExplainBytes
    && delivered.public.deliveryVerified && delivered.public.toolValidationPassed && userApproved;
  return {
    path,
    status: missing ? "missing" : verified ? "verified" : "unverified",
    verified,
    sourceFeature: typeof decision?.sourceFeature === "string" ? decision.sourceFeature : "",
    decisionValid: schemaValid,
    sourceSafe,
    deliveryVerified: delivered.public.deliveryVerified,
    toolValidationPassed: delivered.public.toolValidationPassed,
    userApproved,
    differences: validDifferences(decision?.differences) ? decision.differences : [],
    reason: typeof decision?.reason === "string" ? decision.reason : "",
    hashes: {
      ...delivered.public.hashes,
      approvedSpecification: decision?.approvedSpecificationSha256 || null,
      approvedArtifact: decision?.approvedArtifactSha256 || null,
      currentReview,
      approvedReview: decision?.approvedReviewSha256 || null,
    },
    verification: delivered.public.verification,
    components: delivered.public.components,
  };
}

function projectBaselineLifecycle(projectBaseline, tasks) {
  const sourceImplementationPending = projectBaseline.verified
    && tasks.some((task) => task.feature === projectBaseline.sourceFeature && task.status !== "done");
  return sourceImplementationPending
    ? { ...projectBaseline, status: "premature", verified: false }
    : projectBaseline;
}

async function architectureSnapshot(featureRoot, feature) {
  const path = join(featureRoot, "architecture");
  const [decisionSource, specificationSource, artifactSource, receiptSource] = await Promise.all([
    optionalFile(join(path, "decision.json")),
    optionalFile(join(path, "system.architecture.json")),
    optionalFile(join(path, "system.architecture.html")),
    optionalFile(join(path, "system.architecture.receipt.json")),
  ]);
  if (![decisionSource, specificationSource, artifactSource, receiptSource].some(Boolean)) {
    return { architecture: null, artifact: null, specification: null };
  }

  const decision = parseJson(decisionSource);
  const specification = parseJson(specificationSource);
  const receipt = parseJson(receiptSource);
  const decisionValid = validDecision(decision);
  const receiptValid = validReceipt(receipt);
  const specificationValid = validArchitectureSpecification(specification);
  const currentSpecification = sha256(specificationSource);
  const currentArtifact = sha256(artifactSource);
  const specificationMatches = Boolean(receiptValid && specificationSource
    && currentSpecification === receipt.specification.sha256
    && specificationSource.byteLength === receipt.specification.bytes);
  const artifactBytesMatch = Boolean(receiptValid && artifactSource
    && artifactSource.byteLength === receipt.artifact.bytes);
  const artifactMatches = Boolean(receiptValid && artifactSource
    && currentArtifact === receipt.artifact.sha256 && artifactBytesMatch);
  const artifactDisplayable = artifactMatches && decisionValid && specificationValid;
  const missing = !decisionSource || !specificationSource || !artifactSource || !receiptSource;
  const invalid = !decisionValid || !receiptValid || !specificationValid;
  const approvalChanged = Boolean(decision?.approvedSpecificationSha256
    && (decision.approvedSpecificationSha256 !== currentSpecification
      || decision.approvedSpecificationSha256 !== receipt?.specification?.sha256));
  const approvedArtifactChanged = Boolean(decision?.approvedArtifactSha256
    && (decision.approvedArtifactSha256 !== currentArtifact
      || decision.approvedArtifactSha256 !== receipt?.artifact?.sha256));
  const sourceChanged = !specificationMatches || approvalChanged || approvedArtifactChanged;
  const approved = decision?.approvedSpecificationSha256 === currentSpecification
    && decision.approvedSpecificationSha256 === receipt?.specification?.sha256
    && specificationMatches
    && artifactMatches
    && (!decision.approvedArtifactSha256
      || (decision.approvedArtifactSha256 === currentArtifact
        && decision.approvedArtifactSha256 === receipt.artifact.sha256));

  let status;
  if (decisionValid && decision.required === false) status = decision.reason.trim() ? "not_required" : "unverified";
  else if (missing) status = "missing";
  else if (invalid) status = "unverified";
  else if (!artifactMatches) status = "artifact_tampered";
  else if (sourceChanged) status = "source_changed";
  else if (!decision.approvedSpecificationSha256) status = "pending_approval";
  else status = approved ? "approved" : "source_changed";

  const developmentGatePassed = status === "approved" || status === "not_required";
  const nextSteps = {
    not_required: "已记录无架构影响，可以进入任务计划。",
    missing: "请补齐架构影响决定、架构源、HTML 和交付回执。",
    unverified: "请重新校验并交付受支持的架构工件。",
    artifact_tampered: "展示工件与回执不一致，请重新交付。",
    source_changed: "架构源或批准修订已变化，请重新交付并批准。",
    pending_approval: "请明确批准当前架构修订。",
    approved: "架构已批准，可以进入任务计划。",
  };

  return { artifact: artifactSource, specification, architecture: {
    feature,
    path,
    required: decisionValid ? decision.required : null,
    mode: decisionValid ? decision.mode : null,
    reason: typeof decision?.reason === "string" ? decision.reason : "",
    status,
    developmentGatePassed,
    artifactDisplayable,
    nextStep: decisionValid && decision.required === false && !decision.reason.trim()
      ? "请填写非空的无架构影响理由。"
      : nextSteps[status],
    lifecycle: {
      current: decision?.mode === "greenfield" ? "absent" : decision?.mode === "existing" ? "recovery_required" : "unknown",
      target: status,
    },
    hashes: {
      currentSpecification,
      receiptSpecification: receipt?.specification?.sha256 || null,
      approvedSpecification: decision?.approvedSpecificationSha256 || null,
      currentBaselineSpecification: decision?.currentBaselineSpecificationSha256 || null,
      currentArtifact,
      receiptArtifact: receipt?.artifact?.sha256 || null,
    },
    verification: {
      receiptSupported: receipt?.schemaVersion === 1,
      receiptValid,
      specificationMatches,
      artifactMatches,
      artifactBytesMatch,
      toolValidation: receipt?.validation || null,
    },
    components: specificationValid
      ? specification.components
        .map(({ id, type, label }) => ({ id, type, label }))
      : [],
  } };
}

async function architectureClosure(
  root,
  feature,
  architecture,
  plannedSpecification,
  projectBaselineSources,
  projectBaseline,
) {
  const plannedSpecificationSha256 = architecture?.hashes?.approvedSpecification || null;
  const actual = await verificationArchitecture(
    join(root, ".scratch", feature, "architecture", "actual"),
    feature,
    plannedSpecificationSha256,
    plannedSpecification,
  );
  const externalProjectBaseline = projectBaseline.sourceFeature !== feature
    && ["verified", "premature"].includes(projectBaseline.status);
  const baseline = externalProjectBaseline
    ? {
      sources: projectBaselineSources,
      public: {
        ...projectBaseline,
        status: projectBaseline.verified ? "from_other_feature" : projectBaseline.status,
        internallyValid: true,
      },
    }
    : await verificationArchitecture(
      join(root, "docs", "architecture"),
      feature,
      plannedSpecificationSha256,
      plannedSpecification,
      { baseline: true, sources: projectBaselineSources },
    );
  return { actual, baseline };
}

function finalizeArchitectureLifecycle(architecture, closure, featureTasks, projectBaseline) {
  const implementationComplete = featureTasks.length > 0
    && featureTasks.every((task) => task.status === "done");
  const actual = closure.actual;
  const baseline = closure.baseline;
  const copyMatchesActual = sameVerificationDelivery(actual, baseline);
  const baselineVerified = implementationComplete
    && actual.public.status === "approved"
    && baseline.public.status === "approved"
    && copyMatchesActual;
  const target = architecture.lifecycle.target;

  architecture.lifecycle = {
    ...architecture.lifecycle,
    actual: architecture.required === false ? "not_applicable" : actual.public.status,
    baseline: architecture.required === false
      ? "not_applicable"
      : baselineVerified ? "verified" : baseline.public.status,
  };
  architecture.actual = architecture.required === false ? null : actual.public;
  architecture.baseline = architecture.required === false ? null : {
    ...baseline.public,
    status: baselineVerified ? "verified" : baseline.public.status,
    copyMatchesActual,
    exactCopyOfThisActual: copyMatchesActual,
    exactApprovedActualCopy: baselineVerified,
  };
  architecture.baselineInternallyValid = architecture.required === false
    ? false : baseline.public.internallyValid;
  architecture.exactCopyOfThisActual = architecture.required === false
    ? false : copyMatchesActual;
  architecture.implementationComplete = implementationComplete;
  architecture.deliveryVerified = architecture.required === false ? false : actual.public.deliveryVerified;
  architecture.toolValidationPassed = architecture.required === false ? false : actual.public.toolValidationPassed;
  architecture.userApproved = architecture.required === false ? false : actual.public.userApproved;
  architecture.workflowStatus = target;
  if (architecture.required === true && architecture.mode === "existing") {
    const currentConfirmed = projectBaseline.verified
      && architecture.hashes.currentBaselineSpecification
      && architecture.hashes.currentBaselineSpecification === projectBaseline.hashes.currentSpecification;
    architecture.lifecycle.current = currentConfirmed ? "confirmed" : "recovery_required";
    if (!currentConfirmed) {
      architecture.developmentGatePassed = false;
      architecture.workflowStatus = "current_baseline_required";
      architecture.nextStep = "请先恢复并确认当前基线，并在规划决定中固定项目架构基线的 SHA-256。";
      return;
    }
  }
  if (architecture.required === false || target !== "approved" || !implementationComplete) return;
  if (actual.public.status !== "approved") {
    architecture.workflowStatus = "actual_pending_review";
    architecture.nextStep = actual.public.status === "missing"
      ? "实现已完成，请生成并交付实际架构四件套，再进行用户复核。"
      : actual.public.status === "pending_review"
        ? "实际架构已交付且校验通过，请复核规划与实际差异并明确批准当前实际架构。"
        : "实现已完成，请修复实际架构校验问题并明确批准当前实际架构。";
  } else if (!baselineVerified) {
    architecture.workflowStatus = "baseline_pending";
    architecture.nextStep = "实际架构已批准；请由外部流程将四件套精确复制到 docs/architecture/，任务视图不会代为写入。";
  } else {
    architecture.workflowStatus = "baseline_verified";
    architecture.nextStep = "长期架构基线已独立验证，并与批准的实际架构精确一致。";
  }
}

export async function readVerifiedArchitectureArtifact(featureRoot, feature) {
  const snapshot = await architectureSnapshot(featureRoot, feature);
  return snapshot.architecture?.artifactDisplayable ? snapshot : null;
}

function findCycles(tasksById) {
  const errors = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(id, trail) {
    if (visiting.has(id)) {
      const cycle = [...trail.slice(trail.indexOf(id)), id].join(" -> ");
      errors.push(diagnostic("dependency_cycle", `Dependency cycle: ${cycle}.`, tasksById.get(id).path));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const task = tasksById.get(id);
    for (const dependency of task.dependsOn) {
      if (tasksById.has(dependency)) visit(dependency, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of tasksById.keys()) visit(id, []);
  return errors;
}

function bindTaskToArchitecture(task, metadata, architecture) {
  if (!architecture) return;
  if (architecture.required === false) {
    task.bindingStatus = "not_required";
    return;
  }

  const addDiagnostic = (code, message) => task.architectureDiagnostics.push({
    ...diagnostic(code, message, task.path),
    taskId: task.id,
  });
  const revision = metadata.revision;
  const affects = metadata.affects;
  if (revision === undefined) addDiagnostic("missing_architecture_revision", "需要架构设计的工单必须填写 architecture_revision。");
  else if (typeof revision !== "string" || !SHA256.test(revision.toLowerCase())) addDiagnostic("invalid_architecture_revision", "工单 architecture_revision 必须是 64 位十六进制 SHA-256。");
  if (affects === undefined) addDiagnostic("missing_architecture_affects", "需要架构设计的工单必须填写非空 affects 列表。");
  else if (!Array.isArray(affects) || !affects.length || affects.some((id) => typeof id !== "string" || !id.trim())) {
    addDiagnostic("invalid_architecture_affects", "工单 affects 必须是非空的组件 ID 列表。");
  }
  if (task.architectureDiagnostics.length) {
    task.bindingStatus = "invalid";
    return;
  }

  const approvedRevision = architecture.hashes.approvedSpecification;
  const approvalCurrent = architecture.developmentGatePassed
    && approvedRevision
    && approvedRevision === architecture.hashes.currentSpecification
    && approvedRevision === architecture.hashes.receiptSpecification;
  if (!approvalCurrent) {
    addDiagnostic("architecture_approval_unverifiable", "批准架构修订与当前源文件或交付回执不再一致。");
    task.bindingStatus = "unverifiable";
    if (architecture.lifecycle?.target === "source_changed") {
      if (task.status === "ready") {
        task.architectureAction = {
          state: "locked",
          message: "架构批准已过期，重新批准前不可开始。",
        };
      } else if (task.status === "in_progress") {
        task.architectureAction = {
          state: "pause_at_safe_checkpoint",
          message: "架构批准已过期；完成当前安全检查点后暂停，重新批准后继续。",
        };
      }
    }
    return;
  }
  if (task.architectureRevision !== approvedRevision) {
    addDiagnostic("architecture_revision_mismatch", "工单 architecture_revision 与批准架构修订不一致。");
    task.bindingStatus = "invalid";
    return;
  }

  const components = new Map(architecture.components.map((component) => [component.id, component]));
  for (const id of task.affects) {
    if (!components.has(id)) addDiagnostic("unknown_architecture_component", `工单 affects 引用了不存在的架构组件：${id}。`);
  }
  if (task.architectureDiagnostics.length) {
    task.bindingStatus = "invalid";
    return;
  }
  task.affectedComponents = task.affects.map((id) => components.get(id));
  task.bindingStatus = "valid";
}

export async function buildTaskGraph(root) {
  const tasks = [];
  const errors = [];
  const specs = [];
  const architectures = [];
  const plannedSpecificationsByFeature = new Map();
  const architectureMetadataByTask = new Map();
  const architectureClosureByFeature = new Map();
  const scratchRoot = join(root, ".scratch");
  const features = await featureDirectories(scratchRoot);
  const projectBaselinePath = join(root, "docs", "architecture");
  const projectBaselineSources = await verificationSources(projectBaselinePath);
  const projectBaselineIntegrity = projectBaselineSnapshot(projectBaselinePath, projectBaselineSources);

  for (const feature of features) {
    const featureRoot = join(scratchRoot, feature);
    const spec = await featureSpec(featureRoot, feature);
    if (spec) specs.push(spec);
    const snapshot = await architectureSnapshot(featureRoot, feature);
    const architecture = snapshot.architecture;
    if (architecture) {
      architectures.push(architecture);
      plannedSpecificationsByFeature.set(feature, snapshot.specification);
    }
    const issues = join(featureRoot, "issues");
    for (const filename of await issueFiles(issues)) {
      const path = join(issues, filename);
      const parsed = ticketFromSource(await readFile(path, "utf8"), { feature, path });
      if (parsed.task) {
        tasks.push(parsed.task);
        architectureMetadataByTask.set(parsed.task.id, parsed.architectureMetadata);
      }
      if (parsed.error) errors.push(parsed.error);
      if (parsed.errors) errors.push(...parsed.errors);
    }
  }

  const projectBaseline = projectBaselineLifecycle(projectBaselineIntegrity, tasks);
  for (const architecture of architectures) {
    architectureClosureByFeature.set(architecture.feature, await architectureClosure(
      root,
      architecture.feature,
      architecture,
      plannedSpecificationsByFeature.get(architecture.feature),
      projectBaselineSources,
      projectBaseline,
    ));
  }

  const tasksById = new Map();
  for (const task of tasks) {
    if (tasksById.has(task.id)) {
      errors.push(diagnostic("duplicate_id", `Duplicate task id: ${task.id}.`, task.path));
    } else {
      tasksById.set(task.id, task);
    }
  }

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (dependency === task.id) {
        errors.push(diagnostic("self_dependency", `Task cannot depend on itself: ${task.id}.`, task.path));
      } else if (!tasksById.has(dependency)) {
        errors.push(diagnostic("missing_dependency", `Missing dependency: ${dependency}.`, task.path));
      }
    }
  }
  errors.push(...findCycles(tasksById));

  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const byStatus = Object.fromEntries([...STATUSES].map((status) => [status, tasks.filter((task) => task.status === status).length]));
  const architecturesByFeature = new Map(architectures.map((architecture) => [architecture.feature, architecture]));
  for (const architecture of architectures) {
    finalizeArchitectureLifecycle(
      architecture,
      architectureClosureByFeature.get(architecture.feature),
      tasks.filter((task) => task.feature === architecture.feature),
      projectBaseline,
    );
  }
  for (const task of tasks) bindTaskToArchitecture(task, architectureMetadataByTask.get(task.id), architecturesByFeature.get(task.feature));
  const frontier = errors.length ? [] : tasks
    .filter((task) => task.status === "ready"
      && task.dependsOn.every((dependency) => tasksById.get(dependency).status === "done")
      && architecturesByFeature.get(task.feature)?.developmentGatePassed !== false
      && ["legacy", "not_required", "valid"].includes(task.bindingStatus))
    .map((task) => task.id);

  return {
    errors,
    tasks,
    edges: tasks.flatMap((task) => task.dependsOn.map((from) => ({ from, to: task.id }))),
    features,
    specs,
    architectures,
    projectBaseline,
    frontier,
    summary: {
      total,
      done,
      progressPercent: total === 0 ? 0 : Math.round((done / total) * 100),
      ...byStatus,
    },
  };
}
