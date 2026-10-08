import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codexVersion } from './environment.mjs';
import {
  project,
  readJson,
  saveJson,
  fileHash,
  newDirectory,
  resolveScope,
  validateInput,
  blob,
  git,
} from './core.mjs';

const insist = (condition, message) => {
  if (!condition) throw new Error(message);
};
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

export function validateSuite(suite, oracle) {
  insist(suite.version === 1 && identifier.test(suite.id || ''), 'Invalid suite version/id.');
  insist(nonempty(suite.source), 'Missing source checkout.');
  insist(
    Array.isArray(suite.variants) &&
      suite.variants.length > 0 &&
      suite.variants.every((v) => ['A', 'B', 'C'].includes(v)) &&
      new Set(suite.variants).size === suite.variants.length,
    'Invalid variants.',
  );
  insist(
    Number.isInteger(suite.repeats) && suite.repeats >= 1 && suite.repeats <= 10,
    'Choose 1–10 repeats before freezing.',
  );
  insist(Array.isArray(suite.calibrationFamilies), 'Declare calibration families.');
  insist(Array.isArray(suite.cases) && suite.cases.length > 0, 'Empty suite.');
  insist(
    oracle.version === 1 && oracle.suiteId === suite.id && Array.isArray(oracle.cases),
    'Oracle belongs to a different suite.',
  );
  const seen = new Set();
  for (const item of suite.cases) {
    insist(identifier.test(item.id || '') && !seen.has(item.id), 'Invalid/duplicate case ID.');
    seen.add(item.id);
    insist(
      nonempty(item.family) &&
        item.exposure === 'heldout' &&
        !suite.calibrationFamilies.includes(item.family),
      `${item.id}: not a held-out family.`,
    );
    for (const variant of suite.variants) validateInput(item.input, variant);
    const entries = oracle.cases.filter((entry) => entry.caseId === item.id);
    insist(entries.length === 1, `${item.id}: expected exactly one oracle entry.`);
    const truth = entries[0];
    insist(
      ['defect', 'control'].includes(truth.kind) && Array.isArray(truth.defects),
      `${item.id}: invalid oracle.`,
    );
    insist(
      truth.kind === 'control' ? truth.defects.length === 0 : truth.defects.length > 0,
      `${item.id}: oracle classification and defect count disagree.`,
    );
    const ids = new Set();
    for (const defect of truth.defects) {
      insist(
        identifier.test(defect.id || '') &&
          !ids.has(defect.id) &&
          nonempty(defect.description) &&
          nonempty(defect.evidence),
        'Incomplete defect oracle.',
      );
      ids.add(defect.id);
    }
  }
  insist(oracle.cases.length === seen.size, 'Unexpected oracle cases.');
  for (const family of new Set(suite.cases.map((item) => item.family))) {
    const members = suite.cases.filter((item) => item.family === family);
    const kinds = members.map((item) => oracle.cases.find((t) => t.caseId === item.id).kind);
    insist(
      kinds.includes('defect') && kinds.includes('control'),
      `${family}: needs a correct control.`,
    );
    const descriptions = members.map((item) =>
      JSON.stringify([
        item.input.prDescription,
        item.input.contextDocuments,
        item.input.reportedChecks,
      ]),
    );
    insist(new Set(descriptions).size === 1, `${family}: paired inputs must differ only in scope.`);
  }
}

export function planSuite(path) {
  const suite = readJson(path);
  const source = resolve(dirname(path), suite.source);
  const oraclePath = resolve(dirname(path), suite.oracle);
  const oracle = readJson(oraclePath);
  validateSuite(suite, oracle);
  const cases = suite.cases.map((item) => {
    const scope = resolveScope(source, item.input);
    insist(
      blob(source, scope.base, 'AGENTS.md') === blob(source, scope.head, 'AGENTS.md'),
      `${item.id}: agent instructions must be unchanged across the feature diff.`,
    );
    for (const revision of [scope.base, scope.head]) {
      const paths = git(source, 'ls-tree', '-r', '--name-only', revision).split('\n');
      insist(
        !paths.some((p) => p.startsWith('.review-evals/')),
        'Evaluation answers are tracked in source.',
      );
    }
    return {
      ...item,
      input: { ...item.input, scope: { base: scope.base, head: scope.head, comparison: 'direct' } },
    };
  });
  return { ...suite, source, cases, oraclePath, oracleDigest: fileHash(oraclePath) };
}

function fileInventory(root, directories) {
  const files = {};
  function visit(path) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, item.name);
      if (item.isDirectory()) visit(child);
      else files[relative(root, child)] = fileHash(child);
    }
  }
  directories.forEach((dir) => visit(join(root, dir)));
  return files;
}

export function freezeSuite(suitePath, output) {
  const plan = planSuite(resolve(suitePath));
  const exposurePath = `${resolve(suitePath)}.exposure.json`;
  insist(
    !existsSync(exposurePath),
    'This suite has been exposed. Keep it as calibration and prepare new held-out changes.',
  );
  const out = newDirectory(resolve(output));
  const harness = join(out, 'harness');
  for (const path of ['scripts/review', 'docs/review', 'node_modules'])
    cpSync(join(project, path), join(harness, path), { recursive: true, verbatimSymlinks: true });
  for (const path of ['package.json', 'package-lock.json'])
    cpSync(join(project, path), join(harness, path));
  cpSync(plan.oraclePath, join(out, 'oracle.json'));
  mkdirSync(join(out, 'inputs'));
  const inputs = {};
  for (const item of plan.cases) {
    saveJson(join(out, 'inputs', `${item.id}.json`), item.input);
    inputs[item.id] = fileHash(join(out, 'inputs', `${item.id}.json`));
  }
  const manifest = {
    version: 1,
    id: plan.id,
    exposurePath,
    createdAt: new Date().toISOString(),
    source: plan.source,
    runtime: { node: process.version, codex: codexVersion() },
    model: process.env.WORKSHOP_REVIEW_MODEL || 'gpt-6-sol',
    effort: process.env.WORKSHOP_REVIEW_EFFORT || 'medium',
    timeoutSeconds: Number(process.env.WORKSHOP_REVIEW_TIMEOUT_SECONDS || 900),
    calibrationFamilies: plan.calibrationFamilies,
    variants: plan.variants,
    repeats: plan.repeats,
    cases: plan.cases.map(({ id, family, exposure, input }) => ({
      id,
      family,
      exposure,
      scope: input.scope,
    })),
    inputs,
    oracleDigest: plan.oracleDigest,
    harnessFiles: {
      ...fileInventory(harness, ['scripts', 'docs']),
      'package.json': fileHash(join(harness, 'package.json')),
      'package-lock.json': fileHash(join(harness, 'package-lock.json')),
    },
  };
  insist(
    Number.isInteger(manifest.timeoutSeconds) && manifest.timeoutSeconds > 0,
    'Invalid timeout.',
  );
  saveJson(join(out, 'manifest.json'), manifest);
  saveJson(join(out, 'seal.json'), { manifestDigest: fileHash(join(out, 'manifest.json')) });
  return manifest;
}

export function validateFrozen(root) {
  const manifest = readJson(join(root, 'manifest.json'));
  insist(
    fileHash(join(root, 'manifest.json')) === readJson(join(root, 'seal.json')).manifestDigest,
    'Frozen manifest changed. Create a new evaluation instead.',
  );
  insist(fileHash(join(root, 'oracle.json')) === manifest.oracleDigest, 'Frozen oracle changed.');
  for (const [path, expected] of Object.entries(manifest.harnessFiles))
    insist(fileHash(join(root, 'harness', path)) === expected, `Frozen harness changed: ${path}`);
  for (const [id, expected] of Object.entries(manifest.inputs))
    insist(
      fileHash(join(root, 'inputs', `${id}.json`)) === expected,
      `Frozen input changed: ${id}`,
    );
  return manifest;
}

export function schedule(manifest) {
  const jobs = [];
  for (let repeat = 1; repeat <= manifest.repeats; repeat++) {
    for (let index = 0; index < manifest.cases.length; index++) {
      const item = manifest.cases[index];
      // Counterbalance ordering; do not always run the baseline first.
      const variants = [...manifest.variants];
      if ((repeat + index) % 2 === 0) variants.reverse();
      for (const variant of variants)
        jobs.push({
          id: `${item.id}-${variant}-${String(repeat).padStart(2, '0')}`,
          caseId: item.id,
          variant,
          repeat,
        });
    }
  }
  return jobs;
}

export async function executeSuite(root, mode) {
  insist(['preflight', 'run'].includes(mode), 'Unknown evaluation mode.');
  const manifest = validateFrozen(root);
  insist(
    manifest.runtime.node === process.version && manifest.runtime.codex === codexVersion(),
    'Runtime differs from the frozen plan. Create a new evaluation configuration.',
  );
  const directory = join(root, mode === 'run' ? 'runs' : 'preflight');
  newDirectory(directory); // Never silently resume or choose the best retry.
  const jobs =
    mode === 'run'
      ? schedule(manifest)
      : manifest.cases.map((item) => ({
          id: item.id,
          caseId: item.id,
          variant: manifest.variants.includes('C') ? 'C' : manifest.variants[0],
        }));
  const state = { mode, manifestDigest: fileHash(join(root, 'manifest.json')), jobs: [] };
  const persist = () => saveJson(join(root, `${mode}.json`), state);
  persist();
  const { runReview } = await import(
    pathToFileURL(join(root, 'harness/scripts/review/run.mjs')).href
  );
  process.env.WORKSHOP_REVIEW_MODEL = manifest.model;
  process.env.WORKSHOP_REVIEW_EFFORT = manifest.effort;
  process.env.WORKSHOP_REVIEW_TIMEOUT_SECONDS = String(manifest.timeoutSeconds);
  for (const job of jobs) {
    validateFrozen(root);
    const record = { ...job, status: 'running' };
    state.jobs.push(record);
    persist();
    console.log(`${mode}: ${job.id}`);
    try {
      await runReview({
        source: manifest.source,
        dependencyRoot: join(root, 'harness'),
        input: readJson(join(root, 'inputs', `${job.caseId}.json`)),
        variant: job.variant,
        output: join(directory, job.id),
        preflightOnly: mode === 'preflight',
      });
      record.status = 'completed';
    } catch (error) {
      record.status = 'failed';
      record.error = error.message;
      persist();
      if (error.interruptedBy) throw error;
      // Keep a failed case visible and continue the predeclared batch without retrying it.
    }
    persist();
  }
  return state;
}

async function collectRuns(root) {
  const manifest = validateFrozen(root);
  const { validateRun } = await import(
    pathToFileURL(join(root, 'harness/scripts/review/run.mjs')).href
  );
  const observations = [];
  for (const job of schedule(manifest)) {
    const dir = join(root, 'runs', job.id);
    const entry = {
      ...job,
      valid: false,
      errors: [],
      runDigest: null,
      durationMs: null,
      usage: null,
    };
    try {
      const run = readJson(join(dir, 'run.json'));
      entry.runDigest = fileHash(join(dir, 'run.json'));
      entry.durationMs = run.durationMs ?? null;
      entry.usage = run.usage ?? null;
      const expected = manifest.cases.find((item) => item.id === job.caseId);
      insist(run.status === 'completed', `Run status: ${run.status}`);
      insist(
        run.codexVersion === manifest.runtime.codex && run.runtime?.node === manifest.runtime.node,
        'Run runtime differs from frozen configuration.',
      );
      insist(
        run.variant === job.variant &&
          run.model === manifest.model &&
          run.effort === manifest.effort &&
          run.timeoutSeconds === manifest.timeoutSeconds &&
          run.scope.base === expected.scope.base &&
          run.scope.head === expected.scope.head,
        'Run configuration does not match frozen plan.',
      );
      insist(
        fileHash(join(dir, 'requested-input.json')) === manifest.inputs[job.caseId],
        'Requested input differs.',
      );
      entry.errors = validateRun(dir).errors;
      entry.valid = entry.errors.length === 0;
      if (entry.valid) {
        entry.text = readFileSync(
          join(dir, job.variant === 'C' ? 'result.json' : 'result.txt'),
          'utf8',
        );
        entry.findings = job.variant === 'C' ? JSON.parse(entry.text).findings : null;
        entry.candidates = job.variant === 'C' ? readJson(join(dir, 'candidates.json')) : [];
      }
    } catch (error) {
      entry.errors.push(error.message);
    }
    observations.push(entry);
  }
  return { manifest, observations };
}

export async function makeAdjudication(root) {
  const { manifest, observations } = await collectRuns(root);
  if (!existsSync(manifest.exposurePath))
    saveJson(manifest.exposurePath, {
      exposedAt: new Date().toISOString(),
      frozenRun: root,
      reason: 'Adjudication opened',
    });
  const oracle = readJson(join(root, 'oracle.json'));
  return {
    version: 1,
    manifestDigest: fileHash(join(root, 'manifest.json')),
    oracleDigest: fileHash(join(root, 'oracle.json')),
    reviewedBy: '',
    records: observations
      .filter((run) => run.valid)
      .map((run) => ({
        runId: run.id,
        runDigest: run.runDigest,
        commentsComplete: false,
        comments: (run.findings || []).map((finding) => ({
          id: finding.id,
          quote: finding.body,
          verdict: 'unresolved',
          defectIds: [],
          duplicateOf: null,
          evidence: '',
        })),
        defects: oracle.cases
          .find((item) => item.caseId === run.caseId)
          .defects.map((defect) => ({
            id: defect.id,
            candidateIds: [],
            inspectionComplete: false,
            evidence: '',
          })),
      })),
  };
}

export function scoreObservations(manifest, oracle, observations, adjudication) {
  insist(
    adjudication.version === 1 && nonempty(adjudication.reviewedBy),
    'Name the adjudicating engineer.',
  );
  insist(Array.isArray(adjudication.records), 'Missing adjudication records.');
  const records = new Map();
  for (const record of adjudication.records) {
    insist(!records.has(record.runId), 'Duplicate adjudication record.');
    insist(
      observations.some((o) => o.id === record.runId && o.valid),
      'Unknown or invalid adjudicated run.',
    );
    records.set(record.runId, record);
  }
  const scores = Object.fromEntries(
    manifest.variants.map((v) => [
      v,
      {
        planned: 0,
        valid: 0,
        invalid: 0,
        unadjudicated: 0,
        adjudicated: 0,
        confirmed: 0,
        falsePositive: 0,
        duplicate: 0,
        unresolved: 0,
        additionalConfirmedComments: 0,
        knownDetected: 0,
        knownOpportunities: 0,
        discoveredButNotReported: 0,
        controlRuns: 0,
        controlsWithFalsePositives: 0,
        controlsWithAdditionalDefects: 0,
        measuredDurationMs: 0,
        durationMissing: 0,
        usageMissing: 0,
        measuredTokens: { input: 0, cachedInput: 0, output: 0 },
      },
    ]),
  );
  for (const run of observations) {
    const score = scores[run.variant];
    score.planned++;
    if (Number.isFinite(run.durationMs)) score.measuredDurationMs += run.durationMs;
    else score.durationMissing++;
    const usage = run.usage;
    if (
      usage &&
      ['input_tokens', 'cached_input_tokens', 'output_tokens'].every((key) =>
        Number.isFinite(usage[key]),
      )
    ) {
      score.measuredTokens.input += usage.input_tokens;
      score.measuredTokens.cachedInput += usage.cached_input_tokens;
      score.measuredTokens.output += usage.output_tokens;
    } else score.usageMissing++;
    if (!run.valid) {
      score.invalid++;
      continue;
    }
    score.valid++;
    const record = records.get(run.id);
    if (!record) {
      score.unadjudicated++;
      continue;
    }
    insist(record.runDigest === run.runDigest, `${run.id}: stale adjudication.`);
    insist(
      record.commentsComplete === true,
      `${run.id}: inventory every actionable comment first.`,
    );
    const truth = oracle.cases.find((item) => item.caseId === run.caseId);
    const known = new Set(truth.defects.map((item) => item.id));
    insist(
      Array.isArray(record.comments) && Array.isArray(record.defects),
      'Missing comments/defects.',
    );
    const ids = new Set(record.comments.map((item) => item.id));
    insist(
      ids.size === record.comments.length && record.comments.every((c) => nonempty(c.id)),
      'Invalid comment IDs.',
    );
    if (run.findings)
      insist(
        run.findings.length === ids.size && run.findings.every((f) => ids.has(f.id)),
        `${run.id}: structured finding inventory is incomplete.`,
      );
    const matched = new Set();
    let falsePositives = 0,
      additional = 0;
    for (const comment of record.comments) {
      insist(
        ['confirmed', 'false_positive', 'duplicate', 'unresolved'].includes(comment.verdict) &&
          nonempty(comment.evidence) &&
          nonempty(comment.quote) &&
          (run.findings
            ? run.findings.find((f) => f.id === comment.id)?.body.includes(comment.quote)
            : run.text.includes(comment.quote)),
        `${run.id}: supply an exact report quote, judgment and evidence.`,
      );
      insist(
        Array.isArray(comment.defectIds) &&
          new Set(comment.defectIds).size === comment.defectIds.length &&
          comment.defectIds.every((id) => known.has(id)),
        'Unknown/duplicate oracle defect.',
      );
      insist(
        comment.verdict === 'confirmed' || comment.defectIds.length === 0,
        'Only confirmed comments detect a defect.',
      );
      if (comment.verdict === 'confirmed') {
        score.confirmed++;
        comment.defectIds.forEach((id) => matched.add(id));
        if (!comment.defectIds.length) {
          score.additionalConfirmedComments++;
          additional++;
        }
      } else if (comment.verdict === 'false_positive') {
        score.falsePositive++;
        falsePositives++;
      } else if (comment.verdict === 'unresolved') score.unresolved++;
      else {
        insist(
          record.comments.some((c) => c.id === comment.duplicateOf && c.verdict === 'confirmed'),
          'A duplicate must link to a confirmed primary comment.',
        );
        score.duplicate++;
      }
    }
    insist(
      record.defects.length === known.size &&
        new Set(record.defects.map((d) => d.id)).size === known.size,
      'Inspect every expected defect once.',
    );
    for (const defect of record.defects) {
      insist(
        known.has(defect.id) &&
          defect.inspectionComplete === true &&
          nonempty(defect.evidence) &&
          Array.isArray(defect.candidateIds),
        'Complete the defect-level inspection.',
      );
      const candidates = run.candidates || [];
      insist(
        defect.candidateIds.every((id) => candidates.some((candidate) => candidate.id === id)),
        'Unknown discovery candidate.',
      );
      if (defect.candidateIds.length && !matched.has(defect.id)) score.discoveredButNotReported++;
    }
    score.knownDetected += matched.size;
    score.knownOpportunities += known.size;
    score.adjudicated++;
    if (truth.kind === 'control') {
      score.controlRuns++;
      if (falsePositives) score.controlsWithFalsePositives++;
      if (additional) score.controlsWithAdditionalDefects++;
    }
  }
  for (const score of Object.values(scores)) {
    score.precision =
      score.confirmed + score.falsePositive
        ? score.confirmed / (score.confirmed + score.falsePositive)
        : null;
    score.knownDefectRecall = score.knownOpportunities
      ? score.knownDetected / score.knownOpportunities
      : null;
    score.adjudicationComplete = score.unadjudicated === 0;
    score.evaluationComplete = score.invalid === 0 && score.unadjudicated === 0;
  }
  return {
    scores,
    limitations: [
      'Semantic judgments are made by the named engineer, not by a schema or keyword matcher.',
      'Recall covers adjudicated valid runs and known defects only. Invalid and unadjudicated runs stay visible.',
      'Unresolved and duplicate comments are excluded from precision and reported separately.',
      'An additional confirmed defect compromises a supposed correct control; inspect the oracle.',
      'Missing cost/time counters are unknown. Measured totals are partial when missing counters are nonzero.',
      'Repeated runs on one change are not independent new changes. A synthetic pilot does not establish generalization.',
    ],
  };
}

export async function scoreSuite(root, adjudicationPath) {
  const { manifest, observations } = await collectRuns(root);
  const adjudication = readJson(adjudicationPath);
  insist(
    adjudication.manifestDigest === fileHash(join(root, 'manifest.json')) &&
      adjudication.oracleDigest === fileHash(join(root, 'oracle.json')),
    'Adjudication belongs to different evidence.',
  );
  return {
    ...scoreObservations(manifest, readJson(join(root, 'oracle.json')), observations, adjudication),
    runs: observations.map(
      ({ text: _text, findings: _findings, candidates: _candidates, ...rest }) => rest,
    ),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, input, output] = process.argv.slice(2);
  try {
    insist(
      input,
      'Usage: eval.mjs plan SUITE | freeze SUITE NEW-DIR | preflight|run FROZEN-DIR | adjudicate FROZEN-DIR NEW-FILE | score FROZEN-DIR ADJUDICATION',
    );
    let result;
    if (mode === 'plan') {
      const plan = planSuite(resolve(input));
      result = {
        suite: plan.id,
        cases: plan.cases.length,
        variants: plan.variants,
        repeats: plan.repeats,
        modelRequests: 'None; plan only',
      };
    } else if (mode === 'freeze') {
      insist(output, 'Choose a new frozen directory.');
      result = freezeSuite(input, output);
    } else if (['preflight', 'run'].includes(mode))
      result = await executeSuite(resolve(input), mode);
    else if (mode === 'adjudicate') {
      insist(output && !existsSync(output), 'Choose a new adjudication file.');
      result = await makeAdjudication(resolve(input));
      saveJson(resolve(output), result);
    } else if (mode === 'score') {
      insist(output, 'Supply the completed adjudication.');
      result = await scoreSuite(resolve(input), resolve(output));
    } else throw new Error('Unknown evaluation command.');
    console.log(JSON.stringify(result, null, 2));
    if (result.jobs?.some((job) => job.status === 'failed')) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}
