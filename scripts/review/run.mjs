import { executeProcess } from './process.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  focusedWorkflow,
  focusedWorkflows,
  focusedStages,
  focusedArtifacts,
  runFocused,
  validateFocusedRun,
  composeFocused,
  discoverySchema,
  verificationSchema,
} from './focused.mjs';
import { fileURLToPath } from 'node:url';
import {
  contractDir,
  readJson,
  saveJson,
  fileHash,
  newDirectory,
  validateInput,
  resolveScope,
  compose,
  git,
  blob,
  validateReport,
} from './core.mjs';
import {
  snapshot,
  configuration,
  preflight,
  sourceFingerprint,
  codexVersion,
  runtimePath,
} from './environment.mjs';

export function validateRun(runDir) {
  const run = readJson(join(runDir, 'run.json'));
  const errors = [];
  const structured = run.variant === 'C';
  const resultName = structured ? 'result.json' : 'result.txt';
  const artifacts = run.artifacts || {};
  const required = [
    'input.json',
    'trace.jsonl',
    resultName,
    ...(structured ? ['output.schema.json'] : []),
    ...(focusedWorkflows.includes(run.workflow) ? focusedArtifacts(run.workflow) : []),
  ];
  for (const name of required) {
    if (!Object.hasOwn(artifacts, name)) errors.push(`Missing recorded artifact: ${name}`);
  }
  for (const [name, digest] of Object.entries(artifacts)) {
    try {
      if (fileHash(join(runDir, name)) !== digest) errors.push(`Changed artifact: ${name}`);
    } catch {
      errors.push(`Unreadable artifact: ${name}`);
    }
  }
  if (run.exit !== 0 || run.timedOut || run.interruptedBy)
    errors.push('Reviewer did not complete successfully.');
  try {
    if (
      git(run.checkout, 'rev-parse', 'HEAD') !== run.scope.head ||
      sourceFingerprint(run.checkout) !== run.sourceFingerprint
    )
      errors.push('Reviewed source changed.');
  } catch {
    errors.push('Reviewed source is unavailable.');
  }
  let trace;
  try {
    const result = readFileSync(join(runDir, resultName), 'utf8');
    if (!result.trim()) errors.push('Reviewer result is empty.');
    trace = readFileSync(join(runDir, 'trace.jsonl'), 'utf8');
    const events = trace
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
    if (events.some((event) => !event || typeof event.type !== 'string'))
      throw new Error('Invalid trace event');
    const terminal = events
      .filter((event) => ['turn.completed', 'turn.failed', 'error'].includes(event.type))
      .at(-1);
    if (terminal?.type !== 'turn.completed')
      errors.push('Trace does not confirm a completed review turn.');
  } catch {
    errors.push('Unreadable result or invalid JSONL trace.');
  }
  if (run.workflow && !focusedWorkflows.includes(run.workflow))
    errors.push('Unknown review workflow.');
  if (focusedWorkflows.includes(run.workflow)) {
    if (!structured) errors.push('Focused review is only supported for C.');
    if (!errors.length)
      errors.push(
        ...validateFocusedRun(
          runDir,
          run,
          readJson(join(runDir, 'output.schema.json')),
          readJson(join(runDir, 'input.json')),
        ),
      );
  }
  if (!structured || errors.length) return { errors, structured };
  try {
    const validation = validateReport(readJson(join(runDir, resultName)), {
      checkout: run.checkout,
      scope: run.scope,
      input: readJson(join(runDir, 'input.json')),
      schema: readJson(join(runDir, 'output.schema.json')),
      trace,
    });
    return { ...validation, errors: [...errors, ...validation.errors] };
  } catch (error) {
    return {
      errors: [`Invalid structured result: ${error.message}`],
      structured: true,
    };
  }
}

export function reviewArgs(run, config, resultPath, schemaPath = null) {
  return [
    '--no-daemon',
    'exec',
    '-C',
    run.checkout,
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--strict-config',
    ...[
      'memories',
      'external_agent_memory_import',
      'plugins',
      'apps',
      'hooks',
      'multi_agent',
      'multi_agent_v2',
      'shell_snapshot',
    ].flatMap((flag) => ['--disable', flag]),
    ...config.args,
    '-m',
    run.model,
    '-c',
    `model_reasoning_effort=${JSON.stringify(run.effort)}`,
    ...(schemaPath ? ['--output-schema', schemaPath] : []),
    '--json',
    '-o',
    resultPath,
    '-',
  ];
}

async function executeFocusedStage(run, config, out, dir, stageRun, signal) {
  stageRun.args = reviewArgs(
    run,
    config,
    join(dir, 'result.json'),
    join(dir, 'output.schema.json'),
  );
  saveJson(join(out, 'run.json'), run);
  const execution = await executeProcess('codex', stageRun.args, {
    cwd: run.checkout,
    env: {
      ...process.env,
      PATH: runtimePath,
      TMPDIR: join(run.checkout, '.review-tmp'),
    },
    input: readFileSync(join(dir, 'prompt.txt'), 'utf8'),
    stdoutPath: join(dir, 'trace.jsonl'),
    stderrPath: join(dir, 'stderr.log'),
    timeoutMs: stageRun.timeoutMs,
    signal,
  });
  stageRun.exit = execution.status;
  stageRun.signal = execution.signal;
  stageRun.timedOut = execution.timedOut;
  stageRun.interruptedBy = execution.interruptedBy;
  stageRun.durationMs = Date.now() - new Date(stageRun.startedAt).getTime();
  stageRun.usage = null;
  for (const line of readFileSync(join(dir, 'trace.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'turn.completed' && event.usage) stageRun.usage = event.usage;
    } catch {
      /* Stage validation rejects malformed JSONL. */
    }
  }
  if (execution.error) throw execution.error;
  if (execution.interruptedBy) {
    const error = new Error(`C ${stageRun.name} interrupted by ${execution.interruptedBy}.`);
    error.interruptedBy = execution.interruptedBy;
    error.exitCode = execution.interruptedBy === 'SIGINT' ? 130 : 143;
    throw error;
  }
  if (execution.timedOut) throw new Error(`C ${stageRun.name} exceeded its time allocation.`);
  if (execution.status !== 0)
    throw new Error(`C ${stageRun.name} exited with ${execution.status}.`);
}

export async function runReview({
  source,
  input,
  variant,
  output,
  preflightOnly = false,
  dependencyRoot = source,
  signal,
}) {
  validateInput(input, variant);
  source = resolve(source);
  const timeoutSeconds = Number(process.env.WORKSHOP_REVIEW_TIMEOUT_SECONDS || 900);
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1)
    throw new Error('Review timeout must be a positive integer.');
  const scope = resolveScope(source, input);
  const out = newDirectory(output);
  const run = {
    version: 1,
    variant,
    scope,
    source,
    startedAt: new Date().toISOString(),
    status: 'preparing',
    exit: null,
    artifacts: {},
  };
  saveJson(join(out, 'run.json'), run);
  try {
    const prepared = snapshot(source, scope, out, dependencyRoot);
    run.checkout = prepared.checkout;
    run.sourceFingerprint = sourceFingerprint(run.checkout);
    run.codexVersion = codexVersion();
    run.runtime = {
      node: process.version,
      dependencyCheckout: resolve(dependencyRoot),
      lockfileSha256: fileHash(join(run.checkout, 'package-lock.json')),
    };
    run.timeoutSeconds = timeoutSeconds;
    const config = configuration(run.checkout, prepared.writable);
    saveJson(join(out, 'permissions.json'), config.settings);
    for (const path of input.contextDocuments) blob(run.checkout, scope.head, path);
    const checks = await preflight(run.checkout, config, source, out, signal);
    const delivered = {
      ...input,
      scope: { base: scope.base, head: scope.head, comparison: 'direct' },
      reportedChecks: [
        ...input.reportedChecks,
        ...checks
          .filter((check) => check.kind === 'project_check')
          .map((check) => ({
            command: check.command.join(' '),
            result: 'passed in the reviewer sandbox',
            source: `harness preflight: ${check.log}`,
          })),
      ],
    };
    if (variant === 'A') delete delivered.prDescription;
    const schema = readJson(join(contractDir, 'output.schema.json'));
    saveJson(join(out, 'requested-input.json'), input);
    saveJson(join(out, 'input.json'), delivered);
    saveJson(join(out, 'output.schema.json'), schema);
    writeFileSync(join(out, 'prompt.txt'), compose(variant, delivered));
    for (const name of [
      'requested-input.json',
      'input.json',
      'output.schema.json',
      'prompt.txt',
      'permissions.json',
      'preflight.json',
      ...checks.map((check) => check.log),
    ])
      run.artifacts[name] = fileHash(join(out, name));
    run.model = process.env.WORKSHOP_REVIEW_MODEL || 'gpt-6-sol';
    run.effort = process.env.WORKSHOP_REVIEW_EFFORT || 'medium';
    if (variant === 'C') {
      run.version = 2;
      run.workflow = focusedWorkflow;
      run.status = preflightOnly ? 'preflight_passed' : 'running';
      run.stagePlan = focusedStages;
      saveJson(join(out, 'run.json'), run);
      if (preflightOnly) {
        for (const stage of focusedStages) {
          const dir = join(out, 'stages', stage);
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'prompt.txt'), composeFocused(stage, delivered));
          saveJson(
            join(dir, 'output.schema.json'),
            stage === 'verification'
              ? verificationSchema(schema, null, true)
              : discoverySchema(schema),
          );
          for (const name of ['prompt.txt', 'output.schema.json'])
            run.artifacts[`stages/${stage}/${name}`] = fileHash(join(dir, name));
        }
      } else {
        await runFocused({
          out,
          run,
          input: delivered,
          schema,
          writable: prepared.writable,
          execute: ({ dir, stageRun }) =>
            executeFocusedStage(run, config, out, dir, stageRun, signal),
          persist: () => saveJson(join(out, 'run.json'), run),
        });
        saveJson(join(out, 'run.json'), run);
        const validation = validateRun(out);
        saveJson(join(out, 'validation.json'), validation);
        if (validation.errors.length) throw new Error(validation.errors.join('\n'));
        run.status = 'completed';
      }
      run.finishedAt = new Date().toISOString();
      run.durationMs = Date.now() - new Date(run.startedAt).getTime();
      saveJson(join(out, 'run.json'), run);
      return out;
    }
    const resultName = variant === 'C' ? 'result.json' : 'result.txt';
    const args = reviewArgs(
      run,
      config,
      join(out, resultName),
      variant === 'C' ? join(out, 'output.schema.json') : null,
    );
    run.args = args;
    run.status = preflightOnly ? 'preflight_passed' : 'running';
    saveJson(join(out, 'run.json'), run);
    if (preflightOnly) {
      run.finishedAt = new Date().toISOString();
      run.durationMs = Date.now() - new Date(run.startedAt).getTime();
      saveJson(join(out, 'run.json'), run);
      return out;
    }
    const execution = await executeProcess('codex', args, {
      cwd: run.checkout,
      env: {
        ...process.env,
        PATH: runtimePath,
        TMPDIR: join(run.checkout, '.review-tmp'),
      },
      input: readFileSync(join(out, 'prompt.txt'), 'utf8'),
      stdoutPath: join(out, 'trace.jsonl'),
      stderrPath: join(out, 'stderr.log'),
      timeoutMs: timeoutSeconds * 1000,
      signal,
    });
    run.exit = execution.status;
    run.signal = execution.signal;
    run.timedOut = execution.timedOut;
    run.interruptedBy = execution.interruptedBy;
    run.durationMs = Date.now() - new Date(run.startedAt).getTime();
    run.usage = null;
    for (const line of readFileSync(join(out, 'trace.jsonl'), 'utf8').split('\n').filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'turn.completed' && event.usage) run.usage = event.usage;
      } catch {
        /* Validator will reject malformed JSONL. */
      }
    }
    for (const name of ['trace.jsonl', 'stderr.log', resultName])
      if (existsSync(join(out, name))) run.artifacts[name] = fileHash(join(out, name));
    saveJson(join(out, 'run.json'), run);
    if (execution.error) throw execution.error;
    if (run.interruptedBy) {
      const error = new Error(`Review interrupted by ${run.interruptedBy}.`);
      error.interruptedBy = run.interruptedBy;
      error.exitCode = run.interruptedBy === 'SIGINT' ? 130 : 143;
      throw error;
    }
    if (run.timedOut) throw new Error('Review exceeded its recorded time limit.');
    const validation = validateRun(out);
    saveJson(join(out, 'validation.json'), validation);
    run.status = validation.errors.length ? 'validation_failed' : 'completed';
    run.finishedAt = new Date().toISOString();
    saveJson(join(out, 'run.json'), run);
    if (validation.errors.length) throw new Error(validation.errors.join('\n'));
    return out;
  } catch (error) {
    run.status = error.interruptedBy ? 'interrupted' : 'failed';
    if (error.interruptedBy) run.interruptedBy = error.interruptedBy;
    run.error = error.message;
    run.finishedAt = new Date().toISOString();
    saveJson(join(out, 'run.json'), run);
    const wrapped = new Error(`${error.message}\nArtifacts preserved: ${out}`, {
      cause: error,
    });
    wrapped.exitCode = error.exitCode || 1;
    wrapped.interruptedBy = error.interruptedBy;
    throw wrapped;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, variant, inputPath, source, output, dependencyRoot] = process.argv.slice(2);
  if (!['preflight', 'run'].includes(mode) || !output)
    throw new Error(
      'Usage: node scripts/review/run.mjs preflight|run A|B|C input.json checkout new-run-directory [dependency-checkout]',
    );
  try {
    const dir = await runReview({
      source,
      input: readJson(resolve(inputPath)),
      variant,
      output,
      dependencyRoot: dependencyRoot || source,
      preflightOnly: mode === 'preflight',
    });
    console.log(`${mode} completed: ${dir}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  }
}
