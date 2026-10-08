import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import {
  composeContext,
  contractDir,
  readJson,
  saveJson,
  fileHash,
  validateShape,
  validateReport,
  blob,
  git,
} from './core.mjs';
import { resetWritable, sourceFingerprint } from './environment.mjs';
import * as legacy from './focused-v1.mjs';

export const focusedWorkflow = 'focused-v3-expectation-gate';
export const focusedWorkflows = [
  'focused-v1',
  'focused-v2',
  'focused-v3',
  'focused-v3-efficient',
  'focused-v3-exploratory',
  'focused-v3-exploratory-ids',
  focusedWorkflow,
];
const constrainedIdWorkflows = new Set(['focused-v3-exploratory-ids', focusedWorkflow]);
export const focusedStages = ['semantics', 'implementation', 'verification'];
const allocations = [0.35, 0.35, 0.3];
const text = { type: 'string', minLength: 1, pattern: '\\S' };

export function discoverySchema(schema) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['checks', 'limitations'],
    properties: {
      checks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'boundary',
            'expectation',
            'basis',
            'scenario',
            'evidence',
            'outcome',
            'openQuestion',
            'location',
          ],
          properties: {
            id: { ...text, pattern: '^[A-Za-z][A-Za-z0-9_-]*$' },
            boundary: text,
            expectation: text,
            basis: text,
            scenario: text,
            evidence: text,
            outcome: {
              type: 'string',
              enum: ['suspected', 'refuted', 'unresolved', 'not_checked'],
            },
            openQuestion: { type: 'string' },
            location: {
              anyOf: [schema.properties.findings.items.properties.location, { type: 'null' }],
            },
          },
        },
      },
      limitations: { type: 'array', items: text },
    },
  };
}

export function verificationSchema(schema, candidateIds = null, requireExpectation = false) {
  // No candidates are known for previews or historical schemas. Runtime schemas
  // restrict original-stage IDs; new verifier IDs still require a matching check.
  const newCandidateId = { type: 'string', pattern: '^verification:[A-Za-z][A-Za-z0-9_-]*$' };
  const candidateId =
    candidateIds === null
      ? text
      : candidateIds.length
        ? { anyOf: [{ type: 'string', enum: candidateIds }, newCandidateId] }
        : newCandidateId;
  const result = {
    type: 'object',
    additionalProperties: false,
    required: ['report', 'additionalCandidates', 'dispositions'],
    properties: {
      report: schema,
      additionalCandidates: discoverySchema(schema).properties.checks,
      dispositions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'candidateId',
            'status',
            'findingId',
            'questionIndex',
            'expectation',
            'evidence',
            'reason',
          ],
          properties: {
            candidateId,
            status: {
              type: 'string',
              enum: ['supported', 'disproved', 'unresolved'],
            },
            findingId: { anyOf: [text, { type: 'null' }] },
            questionIndex: {
              anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            },
            expectation: text,
            evidence: text,
            reason: text,
          },
        },
      },
    },
  };
  if (requireExpectation) {
    const disposition = result.properties.dispositions.items;
    const { candidateId, status, findingId, questionIndex } = disposition.properties;
    disposition.properties = {
      candidateId,
      expectationBasis: {
        type: 'string',
        enum: ['documented', 'inferred', 'unresolved', 'unsupported'],
        description:
          'Basis for the required behavior: applicable explicit obligation, concrete consumer dependency or harm, unresolved intent, or no actionable obligation.',
      },
      expectation: {
        ...text,
        description:
          'Required behavior and its source, or the unresolved decision. Observation alone is not an obligation.',
      },
      evidence: {
        ...text,
        description:
          'Reachable trigger, actual consequence and relevant counterevidence from source or executed checks.',
      },
      reason: {
        ...text,
        description:
          'Why this disposition follows. When promoting an unresolved candidate, identify evidence resolving its open question.',
      },
      status,
      findingId,
      questionIndex,
    };
    disposition.required = Object.keys(disposition.properties);
    // Assess candidates before writing final comments; retain historical schema order otherwise.
    const { additionalCandidates, dispositions, report } = result.properties;
    result.properties = { additionalCandidates, dispositions, report };
    result.required = Object.keys(result.properties);
  }
  return result;
}

export function collectChecks(reports) {
  return focusedStages.slice(0, 2).flatMap((stage) =>
    reports[stage].checks.map((value) => ({
      id: `${stage}:${value.id}`,
      value,
    })),
  );
}

export function collectCandidates(reports) {
  return collectChecks(reports).filter(({ value }) =>
    ['suspected', 'unresolved'].includes(value.outcome),
  );
}

export function withAdditionalCandidates(candidates, verification) {
  const additional = verification.additionalCandidates.map((value) => {
    if (!['suspected', 'unresolved'].includes(value.outcome))
      throw new Error('Additional verification candidates must be suspected or unresolved.');
    return { id: `verification:${value.id}`, value };
  });
  const combined = [...candidates, ...additional];
  if (new Set(combined.map((item) => item.id)).size !== combined.length)
    throw new Error('Duplicate candidate IDs.');
  return combined;
}

export function validateDiscovery(result, { checkout, scope, schema }) {
  const errors = validateShape(result, discoverySchema(schema));
  if (errors.length) return errors;
  const ids = new Set();
  for (const check of result.checks) {
    if (ids.has(check.id)) errors.push(`Duplicate check ID: ${check.id}`);
    ids.add(check.id);
    if (check.outcome === 'unresolved' && !check.openQuestion.trim())
      errors.push(`${check.id}: unresolved checks require the missing evidence or decision.`);
    if (check.location) {
      try {
        const { path, revision, startLine, endLine } = check.location;
        const lines = blob(checkout, scope[revision], path).replace(/\n$/, '').split('\n').length;
        if (startLine > endLine || endLine > lines) throw new Error('Invalid line range.');
      } catch (error) {
        errors.push(`${check.id}: ${error.message}`);
      }
    }
  }
  return errors;
}

function focusedPrompt(stage, input) {
  if (!focusedStages.includes(stage)) throw new Error(`Unknown C stage: ${stage}`);
  // Stable instructions precede case-specific context. Actual provider cache hits
  // also depend on the CLI-rendered prefix; this does not share session history.
  const sections = [readFileSync(join(contractDir, 'C-common.md'), 'utf8').trim()];
  if (stage !== 'verification')
    sections.push(readFileSync(join(contractDir, 'C-investigate.md'), 'utf8').trim());
  sections.push(readFileSync(join(contractDir, `C-${stage}.md`), 'utf8').trim());
  sections.push(composeContext('C', input).trim());
  return `${sections.join('\n\n')}\n`;
}

export function composeFocused(stage, input, candidates = [], reports = {}) {
  return (
    focusedPrompt(stage, input) +
    (stage === 'verification' ? formatCandidates(candidates, reports) : '')
  );
}

function formatCheck({ id, value }, label) {
  let prompt = `\n### ${label} ${id}\n\n`;
  for (const field of [
    'boundary',
    'expectation',
    'basis',
    'scenario',
    'evidence',
    'outcome',
    'openQuestion',
  ])
    if (value[field]) prompt += `${field}: ${value[field]}\n`;
  if (value.location) {
    const { path, startLine, endLine, revision } = value.location;
    prompt += `Location: ${path}:${startLine}-${endLine} (${revision})\n`;
  }
  return prompt;
}

function formatCandidates(candidates, reports) {
  let prompt = '\n## Candidate checks (untrusted proposals to verify)\n';
  prompt +=
    '\nOnly the Candidate IDs in this section need dispositions. Check IDs in the audit section are not candidates. New issues require additionalCandidates and verification:<id>.\n';
  if (!candidates.length) prompt += '\nNo candidate issues were reported.\n';
  for (const candidate of candidates) prompt += formatCheck(candidate, 'Candidate');
  // Negative conclusions can hide incomplete checks. Expose them only to verification.
  // They are evidence to audit, not additional candidates requiring a disposition.
  const negativeChecks = Object.entries(reports).flatMap(([stage, report]) =>
    report.checks
      .filter((check) => check.outcome === 'refuted')
      .map((value) => ({ id: `${stage}:${value.id}`, value })),
  );
  if (negativeChecks.length) {
    prompt += '\n## Negative check conclusions (audit their scope)\n';
    for (const check of negativeChecks) prompt += formatCheck(check, 'Check');
  }
  for (const [stage, report] of Object.entries(reports)) {
    const limits = investigationLimits({ [stage]: report });
    if (limits.length)
      prompt += `\n### ${stage} investigation limits\n\n${limits.map((value) => `- ${value}`).join('\n')}\n`;
  }
  return prompt;
}

function investigationLimits(reports) {
  return Object.entries(reports).flatMap(([stage, report]) => [
    ...report.limitations.map((value) => `${stage}: ${value}`),
    ...report.checks
      .filter((check) => check.outcome === 'not_checked')
      .map((check) => `${stage}:${check.id} not checked — ${check.boundary}: ${check.evidence}`),
  ]);
}

// This validates attribution and links, not the truth of the model's evidence.
export function finalizeVerification(
  candidates,
  verification,
  reports = {},
  requireExpectation = false,
) {
  candidates = withAdditionalCandidates(candidates, verification);
  const ids = new Set(candidates.map((candidate) => candidate.id));
  const seen = new Set();
  const report = structuredClone(verification.report);
  const findings = new Set(report.findings.map((finding) => finding.id));
  const supported = new Set();
  for (const {
    candidateId,
    status,
    findingId,
    questionIndex,
    reason,
    expectationBasis,
  } of verification.dispositions) {
    if (!ids.has(candidateId) || seen.has(candidateId))
      throw new Error(`Unknown or duplicate candidate disposition: ${candidateId}`);
    seen.add(candidateId);
    if (requireExpectation) {
      if (!['documented', 'inferred', 'unresolved', 'unsupported'].includes(expectationBasis))
        throw new Error(`${candidateId}: invalid expectation basis.`);
      if (status === 'supported' && !['documented', 'inferred'].includes(expectationBasis))
        throw new Error(`${candidateId}: a supported finding requires an established expectation.`);
      if (expectationBasis === 'unresolved' && (status !== 'unresolved' || questionIndex === null))
        throw new Error(
          `${candidateId}: unresolved intent requires a linked requirements question.`,
        );
      if (expectationBasis === 'unsupported' && status !== 'disproved')
        throw new Error(
          `${candidateId}: an unsupported expectation cannot justify a defect or product decision.`,
        );
    }
    if (status === 'supported') {
      if (!findings.has(findingId))
        throw new Error(`Supported candidate ${candidateId} has no final finding.`);
      if (questionIndex !== null)
        throw new Error(
          `${candidateId}: a confirmed defect cannot link to an unresolved question.`,
        );
      supported.add(findingId);
    } else {
      if (findingId !== null) throw new Error(`${candidateId}: unsupported finding link.`);
      if (status === 'unresolved') {
        if (questionIndex === null)
          report.limitations.push(`Unresolved candidate ${candidateId}: ${reason}`);
        else if (
          !Number.isInteger(questionIndex) ||
          questionIndex < 0 ||
          questionIndex >= report.requirementsQuestions.length
        )
          throw new Error(`${candidateId}: invalid question index.`);
      } else if (status !== 'disproved' || questionIndex !== null)
        throw new Error(`${candidateId}: invalid disposition or question link.`);
    }
  }
  if (seen.size !== ids.size) throw new Error('Every candidate requires a disposition.');
  if ([...findings].some((id) => !supported.has(id)))
    throw new Error('Every final finding requires a supported candidate.');
  report.limitations = [...new Set([...report.limitations, ...investigationLimits(reports)])];
  return report;
}

export function readTrace(path) {
  const events = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map(JSON.parse);
  if (events.some((event) => !event || typeof event.type !== 'string'))
    throw new Error('Invalid trace event.');
  const terminal = events
    .filter((event) => ['turn.completed', 'turn.failed', 'error'].includes(event.type))
    .at(-1);
  if (terminal?.type !== 'turn.completed')
    throw new Error('Trace does not confirm a completed review turn.');
  return events;
}

export function aggregateTraces(out) {
  return (
    focusedStages
      .flatMap((stage) =>
        readTrace(join(out, 'stages', stage, 'trace.jsonl')).map((event) =>
          JSON.stringify({ ...event, reviewStage: stage }),
        ),
      )
      .join('\n') + '\n'
  );
}

export function focusedArtifacts(workflow = focusedWorkflow) {
  return [
    'candidates.json',
    'dispositions.json',
    ...(workflow !== 'focused-v1' ? ['checks.json'] : []),
    ...focusedStages.flatMap((stage) =>
      ['prompt.txt', 'output.schema.json', 'result.json', 'trace.jsonl', 'stderr.log'].map(
        (name) => `stages/${stage}/${name}`,
      ),
    ),
  ];
}

export async function runFocused({ out, run, input, schema, writable, execute, persist }) {
  run.workflow = focusedWorkflow;
  run.stages = [];
  const reports = {};
  // Capture instructions once; edits to the harness during a run must not alter later stages.
  const prompts = Object.fromEntries(
    focusedStages.map((stage) => [stage, focusedPrompt(stage, input)]),
  );
  const deadline = Date.now() + run.timeoutSeconds * 1000;
  const record = (name) => {
    run.artifacts[name] = fileHash(join(out, name));
  };
  for (const [index, stage] of focusedStages.entries()) {
    // Sequential fresh sessions share only read-only source. Discard all writable leftovers.
    resetWritable(run.checkout, writable);
    if (
      git(run.checkout, 'rev-parse', 'HEAD') !== run.scope.head ||
      sourceFingerprint(run.checkout) !== run.sourceFingerprint
    )
      throw new Error('Reviewed source changed between C stages.');
    const dir = join(out, 'stages', stage);
    mkdirSync(dir, { recursive: true });
    const candidates = stage === 'verification' ? collectCandidates(reports) : [];
    const stageSchema =
      stage === 'verification'
        ? verificationSchema(
            schema,
            candidates.map(({ id }) => id),
            true,
          )
        : discoverySchema(schema);
    if (stage === 'verification') {
      saveJson(join(out, 'candidates.json'), candidates);
      record('candidates.json');
    }
    writeFileSync(
      join(dir, 'prompt.txt'),
      prompts[stage] + (stage === 'verification' ? formatCandidates(candidates, reports) : ''),
    );
    saveJson(join(dir, 'output.schema.json'), stageSchema);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('C review exceeded its total model execution time limit.');
    const stageRun = {
      name: stage,
      status: 'running',
      startedAt: new Date().toISOString(),
      timeoutMs: Math.max(
        1,
        Math.min(Math.floor(run.timeoutSeconds * 1000 * allocations[index]), remaining),
      ),
      sourceFingerprint: run.sourceFingerprint,
    };
    run.stages.push(stageRun);
    persist();
    try {
      await execute({ dir, stageRun });
      if (stageRun.exit !== 0 || stageRun.timedOut || stageRun.interruptedBy)
        throw new Error(`C stage ${stage} did not complete successfully.`);
      readTrace(join(dir, 'trace.jsonl'));
      const result = readJson(join(dir, 'result.json'));
      const shapeErrors = validateShape(result, stageSchema);
      if (shapeErrors.length) throw new Error(shapeErrors.join('\n'));
      const validationOptions = {
        checkout: run.checkout,
        scope: run.scope,
        input,
        schema,
        trace: readFileSync(join(dir, 'trace.jsonl'), 'utf8'),
      };
      const validation =
        stage === 'verification'
          ? {
              errors: [
                ...validateReport(result.report, validationOptions).errors,
                ...validateDiscovery(
                  { checks: result.additionalCandidates, limitations: [] },
                  validationOptions,
                ),
              ],
            }
          : { errors: validateDiscovery(result, validationOptions) };
      if (validation.errors.length) throw new Error(validation.errors.join('\n'));
      if (
        sourceFingerprint(run.checkout) !== run.sourceFingerprint ||
        git(run.checkout, 'rev-parse', 'HEAD') !== run.scope.head
      )
        throw new Error('C stage changed reviewed source.');
      if (stage === 'verification') {
        const report = finalizeVerification(candidates, result, reports, true);
        saveJson(join(out, 'candidates.json'), withAdditionalCandidates(candidates, result));
        saveJson(join(out, 'checks.json'), collectChecks(reports));
        saveJson(join(out, 'result.json'), report);
        saveJson(join(out, 'dispositions.json'), result.dispositions);
        writeFileSync(join(out, 'trace.jsonl'), aggregateTraces(out));
        cpSync(join(dir, 'prompt.txt'), join(out, 'prompt.txt'));
        cpSync(join(dir, 'stderr.log'), join(out, 'stderr.log'));
        for (const name of [
          'result.json',
          'candidates.json',
          'checks.json',
          'dispositions.json',
          'trace.jsonl',
          'prompt.txt',
          'stderr.log',
        ])
          record(name);
      } else reports[stage] = result;
      stageRun.status = 'completed';
    } catch (error) {
      stageRun.status = error.interruptedBy ? 'interrupted' : 'failed';
      stageRun.error = error.message;
      throw error;
    } finally {
      stageRun.finishedAt = new Date().toISOString();
      for (const name of [
        'prompt.txt',
        'output.schema.json',
        'result.json',
        'trace.jsonl',
        'stderr.log',
      ])
        if (existsSync(join(dir, name))) record(`stages/${stage}/${name}`);
      // Preserve reproductions outside the reviewer-readable checkout before the next reset.
      cpSync(join(run.checkout, '.review-tmp'), join(dir, 'scratch'), {
        recursive: true,
        dereference: false,
      });
      persist();
    }
  }
  run.exit = 0;
  const usages = run.stages.map((stage) => stage.usage);
  run.usage = usages.every(Boolean)
    ? Object.fromEntries(
        [...new Set(usages.flatMap((usage) => Object.keys(usage)))].map((key) => [
          key,
          usages.reduce((total, usage) => total + (usage[key] || 0), 0),
        ]),
      )
    : null;
  persist();
}

export function validateFocusedRun(out, run, schema, input) {
  const errors = [];
  try {
    if (!focusedWorkflows.includes(run.workflow)) throw new Error('Unknown C workflow.');
    const isLegacy = run.workflow === 'focused-v1';
    const contract = isLegacy
      ? legacy
      : {
          discoverySchema,
          verificationSchema,
          collectCandidates,
          finalizeVerification,
        };
    if (JSON.stringify(run.stages?.map((stage) => stage.name)) !== JSON.stringify(focusedStages))
      throw new Error('C requires all three recorded stages in order.');
    const reports = {};
    for (const stage of run.stages) {
      if (
        stage.status !== 'completed' ||
        stage.exit !== 0 ||
        stage.timedOut ||
        stage.interruptedBy ||
        stage.sourceFingerprint !== run.sourceFingerprint
      )
        throw new Error(`C stage ${stage.name} did not complete on the recorded source.`);
      const dir = join(out, 'stages', stage.name);
      readTrace(join(dir, 'trace.jsonl'));
      const result = readJson(join(dir, 'result.json'));
      const expected =
        stage.name === 'verification'
          ? contract.verificationSchema(
              schema,
              constrainedIdWorkflows.has(run.workflow)
                ? collectCandidates(reports).map(({ id }) => id)
                : null,
              run.workflow === focusedWorkflow,
            )
          : contract.discoverySchema(schema);
      if (JSON.stringify(readJson(join(dir, 'output.schema.json'))) !== JSON.stringify(expected))
        throw new Error(`Unexpected schema for C stage ${stage.name}.`);
      errors.push(...validateShape(result, expected));
      if (errors.length) return errors;
      const options = {
        checkout: run.checkout,
        scope: run.scope,
        input,
        schema: isLegacy && stage.name !== 'verification' ? expected : schema,
        trace: readFileSync(join(dir, 'trace.jsonl'), 'utf8'),
      };
      if (isLegacy || stage.name === 'verification')
        errors.push(
          ...validateReport(stage.name === 'verification' ? result.report : result, options).errors,
        );
      if (!isLegacy)
        errors.push(
          ...validateDiscovery(
            stage.name === 'verification'
              ? { checks: result.additionalCandidates, limitations: [] }
              : result,
            options,
          ),
        );
      reports[stage.name] = result;
    }
    const candidates = contract.collectCandidates(reports);
    const checks = {
      'candidates.json': isLegacy
        ? candidates
        : withAdditionalCandidates(candidates, reports.verification),
      ...(!isLegacy ? { 'checks.json': collectChecks(reports) } : {}),
      'dispositions.json': reports.verification.dispositions,
      'result.json': contract.finalizeVerification(
        candidates,
        reports.verification,
        isLegacy
          ? undefined
          : {
              semantics: reports.semantics,
              implementation: reports.implementation,
            },
        run.workflow === focusedWorkflow,
      ),
    };
    for (const [name, value] of Object.entries(checks))
      if (JSON.stringify(readJson(join(out, name))) !== JSON.stringify(value))
        errors.push(`${name} does not match the C stage outputs.`);
    if (readFileSync(join(out, 'trace.jsonl'), 'utf8') !== aggregateTraces(out))
      errors.push('Combined C trace does not match its stage traces.');
    if (fileHash(join(out, 'prompt.txt')) !== fileHash(join(out, 'stages/verification/prompt.txt')))
      errors.push('Root prompt must match the actual verification prompt.');
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}
