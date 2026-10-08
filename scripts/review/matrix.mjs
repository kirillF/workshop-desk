import { cpSync, mkdirSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matrixConcurrency, runMatrixJobs } from './matrix-pool.mjs';
import {
  project,
  contractDir,
  readJson,
  saveJson,
  newDirectory,
  resolveScope,
  validateInput,
  compose,
  blob,
  fileHash,
} from './core.mjs';

import { composeFocused, focusedStages } from './focused.mjs';

export const cases = ['filters', 'edit', 'get'];
export const variants = ['A', 'B', 'C'];

export function planMatrix(source = project) {
  return cases.map((name) => {
    const requested = readJson(join(contractDir, 'examples', `${name}.json`));
    const scope = resolveScope(source, requested);
    const input = {
      ...requested,
      scope: { base: scope.base, head: scope.head, comparison: 'direct' },
    };
    for (const variant of variants) {
      validateInput(input, variant);
      if (variant === 'C') focusedStages.forEach((stage) => composeFocused(stage, input));
      else compose(variant, input);
    }
    if (blob(source, scope.base, 'AGENTS.md') !== blob(source, scope.head, 'AGENTS.md'))
      throw new Error(`${name}: baseline and head must have identical root agent instructions.`);
    return { name, requested, scope, input };
  });
}

export async function runMatrix(mode, output) {
  if (!['plan', 'preflight', 'run'].includes(mode))
    throw new Error(
      'Usage: node scripts/review/matrix.mjs plan|preflight|run [new-output-directory]',
    );
  const concurrency = matrixConcurrency(process.env.WORKSHOP_REVIEW_CONCURRENCY);
  const timeoutSeconds = Number(process.env.WORKSHOP_REVIEW_TIMEOUT_SECONDS || 900);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1)
    throw new Error('Review timeout must be a positive integer.');
  const plan = planMatrix();
  for (const item of plan)
    console.log(
      `${item.name}: A / B / C; ${item.requested.scope.base} -> ${item.requested.scope.head}`,
    );
  if (mode === 'plan') {
    console.log(`Matrix concurrency: ${concurrency} separate worker processes.`);
    console.log(
      'Nine review inputs and fifteen stage prompts validated (verification candidates arrive at runtime). No model requests or environment checks were started.',
    );
    return;
  }
  const destination = resolve(
    output || join(project, '.review-runs', `matrix-${mode}-${Date.now()}`),
  );
  const runsRoot = join(project, '.review-runs');
  const insideRuns = relative(runsRoot, destination);
  if (!insideRuns || insideRuns.startsWith('..') || insideRuns.startsWith('/'))
    throw new Error('Choose a new output directory under the project .review-runs directory.');
  mkdirSync(runsRoot, { recursive: true });
  if (realpathSync(runsRoot) !== runsRoot)
    throw new Error('The run directory must not be a symlink.');
  let parent = dirname(destination);
  while (!existsSync(parent)) parent = dirname(parent);
  const resolvedParent = relative(runsRoot, realpathSync(parent));
  if (resolvedParent.startsWith('..') || resolvedParent.startsWith('/'))
    throw new Error('The output path escapes the run directory through a symlink.');
  const out = newDirectory(destination);
  const frozen = join(out, 'harness');
  const selected = mode === 'preflight' ? ['C'] : variants;
  const manifest = {
    status: 'preparing',
    mode,
    concurrency,
    timeoutSeconds,
    startedAt: new Date().toISOString(),
    model: process.env.WORKSHOP_REVIEW_MODEL || 'gpt-6-sol',
    effort: process.env.WORKSHOP_REVIEW_EFFORT || 'medium',
    cases: plan.map(({ name, requested, scope }) => ({ name, requested, scope })),
    variants,
    harnessFiles: {},
    runs: plan.flatMap(({ name }) =>
      selected.map((variant) => ({
        case: name,
        variant,
        directory: join(out, `${name}-${variant}`),
        status: 'pending',
        stdoutLog: join(out, 'workers', `${name}-${variant}.stdout.log`),
        stderrLog: join(out, 'workers', `${name}-${variant}.stderr.log`),
      })),
    ),
  };
  const persist = () => saveJson(join(out, 'matrix.json'), manifest);
  persist();
  try {
    cpSync(join(project, 'scripts/review'), join(frozen, 'scripts/review'), { recursive: true });
    cpSync(contractDir, join(frozen, 'docs/review'), { recursive: true });
    // Copy dependencies once. An npm install during the batch must not alter later variants.
    cpSync(join(project, 'node_modules'), join(frozen, 'node_modules'), {
      recursive: true,
      verbatimSymlinks: true,
    });
    for (const name of ['package.json', 'package-lock.json'])
      cpSync(join(project, name), join(frozen, name));
    manifest.dependencies = {
      directory: frozen,
      lockfileSha256: fileHash(join(frozen, 'package-lock.json')),
    };
    function recordFiles(dir) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) recordFiles(path);
        else manifest.harnessFiles[relative(frozen, path)] = fileHash(path);
      }
    }
    recordFiles(join(frozen, 'scripts'));
    recordFiles(join(frozen, 'docs'));
    mkdirSync(join(out, 'inputs'));
    for (const item of plan) saveJson(join(out, 'inputs', `${item.name}.json`), item.input);
    mkdirSync(join(out, 'workers'));
    manifest.status = 'running';
    persist();
    console.log(`Running up to ${concurrency} reviews in separate processes.`);
    // Each worker owns a checkout and performs its own preflight; the harness is shared read-only.
    await runMatrixJobs(
      manifest.runs.map((record) => ({
        id: `${record.case}-${record.variant}`,
        record,
        options: {
          source: project,
          dependencyRoot: frozen,
          input: plan.find((item) => item.name === record.case).input,
          variant: record.variant,
          output: record.directory,
          preflightOnly: mode === 'preflight',
        },
      })),
      {
        workerPath: join(frozen, 'scripts/review/matrix-worker.mjs'),
        concurrency,
        env: {
          ...process.env,
          WORKSHOP_REVIEW_MODEL: manifest.model,
          WORKSHOP_REVIEW_EFFORT: manifest.effort,
          WORKSHOP_REVIEW_TIMEOUT_SECONDS: String(timeoutSeconds),
        },
        beforeStart: () => {
          for (const [path, digest] of Object.entries(manifest.harnessFiles)) {
            if (fileHash(join(frozen, path)) !== digest)
              throw new Error(`Frozen harness changed: ${path}`);
          }
        },
        onChange: (record) => {
          persist();
          console.log(
            `${record.case}-${record.variant}: ${record.status}${record.pid ? ` (PID ${record.pid})` : ''}`,
          );
        },
      },
    );
    manifest.status = 'completed';
  } catch (error) {
    manifest.status = error.interruptedBy ? 'interrupted' : 'failed';
    manifest.error = error.message;
    throw error;
  } finally {
    manifest.finishedAt = new Date().toISOString();
    persist();
    console.log(`Matrix artifacts: ${out}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runMatrix(process.argv[2] || 'plan', process.argv[3]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}
