import { matrixConcurrency, runMatrixJobs } from '../scripts/review/matrix-pool.mjs';
import {
  focusedStages,
  composeFocused,
  collectCandidates,
  finalizeVerification,
  runFocused,
  discoverySchema,
  verificationSchema,
  validateDiscovery,
  collectChecks,
  withAdditionalCandidates,
} from '../scripts/review/focused.mjs';
import test from 'node:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { executeProcess } from '../scripts/review/process.mjs';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  cpSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  git,
  readJson,
  saveJson,
  fileHash,
  newDirectory,
  compose,
  composeContext,
  contractDir,
  commandBody,
  validateReport,
  validateShape,
  resolveScope,
} from '../scripts/review/core.mjs';
import {
  snapshot,
  sourceFingerprint,
  configuration,
  shellCommand,
  runtimePath,
  resetWritable,
} from '../scripts/review/environment.mjs';
import { validateRun, reviewArgs } from '../scripts/review/run.mjs';
import { prepareHandoff, verifyFix } from '../scripts/review/feedback.mjs';

function fixture(t, { legacy = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-harness-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const checkout = join(dir, 'repo');
  mkdirSync(checkout);
  git(checkout, 'init', '-q');
  git(checkout, 'config', 'user.email', 'test@example.invalid');
  git(checkout, 'config', 'user.name', 'Harness Test');
  writeFileSync(join(checkout, 'value.js'), 'export const value = 1;\n');
  writeFileSync(join(checkout, 'deleted.js'), 'export const needed = true;\n');
  writeFileSync(join(checkout, 'README.md'), 'Values must remain positive.\n');
  writeFileSync(join(checkout, 'AGENTS.md'), 'Read README.md and preserve the contract.\n');
  writeFileSync(join(checkout, '.gitignore'), 'node_modules/\n');
  saveJson(join(checkout, 'package.json'), {
    scripts: { verify: 'node -e "console.log(123)"' },
  });
  git(checkout, 'add', '.');
  git(checkout, 'commit', '-qm', 'Base');
  const base = git(checkout, 'rev-parse', 'HEAD');
  writeFileSync(join(checkout, 'value.js'), 'export const value = -1;\n');
  rmSync(join(checkout, 'deleted.js'));
  git(checkout, 'add', '.');
  git(checkout, 'commit', '-qm', 'Change');
  const head = git(checkout, 'rev-parse', 'HEAD');
  const input = {
    scope: { base, head, comparison: 'direct' },
    prDescription: 'Preserve positive values.',
    contextDocuments: ['README.md'],
    reportedChecks: [],
  };
  const schema = readJson(
    legacy
      ? new URL('./fixtures/review-output-v1.schema.json', import.meta.url)
      : join(contractDir, 'output.schema.json'),
  );
  const finding = {
    id: 'F1',
    priority: 2,
    title: 'Preserve the value contract',
    location: { path: 'value.js', revision: 'head', startLine: 1, endLine: 1 },
    scenario: 'Read the value.',
    expected: 'Positive value.',
    actual: 'Negative value.',
    impact: 'Breaks consumers.',
    sources: [
      {
        kind: 'pr_description',
        path: '',
        revision: 'input',
        startLine: 0,
        endLine: 0,
        quote: 'Preserve positive values.',
      },
      {
        kind: 'file',
        path: 'README.md',
        revision: 'head',
        startLine: 1,
        endLine: 1,
        quote: 'Values must remain positive.',
      },
    ],
    evidence: {
      method: 'code_trace',
      detail: 'value.js exports -1.',
      checkIds: [],
    },
    followUps: [
      {
        kind: 'regression_test',
        proposal: 'Assert the public contract.',
        acceptanceCondition: 'Fails before the correction and passes after.',
      },
    ],
  };
  const report = {
    findings: [
      legacy
        ? finding
        : {
            id: finding.id,
            priority: finding.priority,
            title: finding.title,
            location: finding.location,
            body: 'Reading value.js now yields -1, violating the positive-value contract in README.md. Static code evidence supports this defect; no runtime reproduction was run.',
            followUps: finding.followUps,
          },
    ],
    ...(legacy ? { checks: [] } : {}),
    requirementsQuestions: [],
    limitations: [],
  };
  const scope = resolveScope(checkout, input);
  const validate = (value = report, trace = '') =>
    validateReport(value, { checkout, scope, input, schema, trace });
  return { dir, checkout, base, head, input, schema, report, scope, validate };
}

test('A is generic; B requires and consumes PR context; C extends B', () => {
  const input = {
    scope: { base: 'main', head: 'HEAD', comparison: 'merge_base' },
    prDescription: 'Unique neutral purpose.',
    contextDocuments: [],
    reportedChecks: [],
  };
  assert.ok(!compose('A', input).includes(input.prDescription));
  for (const variant of ['B', 'C']) {
    assert.ok(compose(variant, input).includes(input.prDescription));
    assert.ok(
      compose(variant, input).includes(
        readFileSync(join(contractDir, 'B-pr-context.md'), 'utf8').trim(),
      ),
    );
    assert.throws(() => compose(variant, { ...input, prDescription: '' }));
  }
  assert.throws(() => compose('C', { ...input, contextDocuments: ['../secrets'] }));
});
test('accepts PR and versioned file sources without requiring runtime evidence', (t) => {
  const f = fixture(t, { legacy: true });
  assert.deepEqual(f.validate().errors, []);
  f.report.findings[0].location = {
    path: 'deleted.js',
    revision: 'base',
    startLine: 1,
    endLine: 1,
  };
  assert.deepEqual(f.validate().errors, []);
});
test('rejects bad source provenance and locations outside the diff', async (t) => {
  const f = fixture(t, { legacy: true });
  const cases = [
    (r) => {
      r.findings[0].location.path = 'README.md';
    },
    (r) => {
      r.findings[0].location.endLine = 1000;
    },
    (r) => {
      r.findings[0].location.startLine = 2;
    },
    (r) => {
      r.findings[0].sources[0].quote = 'Invented requirement';
    },
    (r) => {
      r.findings[0].sources[0].quote = ' ';
    },
    (r) => {
      r.findings[0].sources[1].path = 'missing.md';
    },
    (r) => {
      r.findings[0].sources[1].endLine = 0;
    },
    (r) => {
      r.findings.push(structuredClone(r.findings[0]));
    },
    (r) => {
      r.findings[0].evidence.checkIds = ['missing'];
    },
  ];
  for (const [index, mutate] of cases.entries())
    await t.test(`invalid report ${index}`, () => {
      const report = structuredClone(f.report);
      mutate(report);
      assert.ok(f.validate(report).errors.length);
    });
});
test('execution claims must match completed trace commands, output and exit outcome', (t) => {
  const f = fixture(t, { legacy: true }),
    r = f.report;
  r.findings[0].evidence = {
    method: 'executed_check',
    detail: 'Assertion failed.',
    checkIds: ['T1'],
  };
  r.checks = [
    {
      id: 'T1',
      command: 'npm test',
      outcome: 'failed',
      observation: 'The value assertion failed.',
      outputExcerpt: 'expected positive',
    },
  ];
  const event = {
    type: 'item.completed',
    item: {
      id: 'tool-1',
      type: 'command_execution',
      command: "/bin/zsh -lc 'npm test'",
      exit_code: 1,
      aggregated_output: 'FAIL: expected positive\n',
    },
  };
  const trace = JSON.stringify(event);
  assert.deepEqual(f.validate(r, trace).errors, []);
  assert.ok(f.validate(r).errors.length);
  assert.ok(f.validate(r, '{broken').errors.length);
  assert.ok(f.validate(r, `${trace}\n${trace}`).errors.length);
  r.checks[0].outcome = 'blocked';
  assert.ok(f.validate(r, trace).errors.length);
  r.checks[0].outcome = 'passed';
  assert.ok(f.validate(r, trace).errors.length);
  r.checks[0].outcome = 'failed';
  r.checks[0].outputExcerpt = 'fabricated';
  assert.ok(f.validate(r, trace).errors.length);
});
test('snapshot exposes selected refs only and no alternate object database', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.checkout, 'node_modules'));
  git(f.checkout, 'branch', 'prepared-fix');
  const runDir = newDirectory(join(f.dir, 'snapshot'));
  const s = snapshot(f.checkout, f.scope, runDir);
  assert.equal(git(s.checkout, 'rev-parse', 'HEAD'), f.head);
  assert.equal(git(s.checkout, 'remote'), '');
  assert.equal(git(s.checkout, 'for-each-ref', '--format=%(refname)'), 'refs/heads/review-base');
  assert.throws(() => git(s.checkout, 'rev-parse', '--verify', 'prepared-fix'));
  assert.equal(sourceFingerprint(s.checkout), sourceFingerprint(f.checkout));
});
function savedRun(f) {
  const out = newDirectory(join(f.dir, 'run'));
  for (const [name, value] of Object.entries({
    'input.json': f.input,
    'output.schema.json': f.schema,
    'result.json': f.report,
  }))
    saveJson(join(out, name), value);
  writeFileSync(join(out, 'trace.jsonl'), JSON.stringify({ type: 'turn.completed' }) + '\n');
  saveJson(join(out, 'run.json'), {
    variant: 'C',
    exit: 0,
    checkout: f.checkout,
    scope: f.scope,
    sourceFingerprint: sourceFingerprint(f.checkout),
    artifacts: Object.fromEntries(
      ['input.json', 'output.schema.json', 'result.json', 'trace.jsonl'].map((name) => [
        name,
        fileHash(join(out, name)),
      ]),
    ),
  });
  return out;
}
test('handoff binds human acceptance to the exact result and reviewed head', (t) => {
  const f = fixture(t),
    run = savedRun(f);
  const decision = {
    status: 'accepted',
    reviewHead: f.head,
    resultSha256: fileHash(join(run, 'result.json')),
    reason: 'Contract violation confirmed.',
    findingIds: ['F1'],
    changeScope: ['value.js'],
    preserve: ['Positive public value'],
    acceptance: ['Regression fails then passes.'],
  };
  const out = join(f.dir, 'handoff');
  assert.throws(() => prepareHandoff(run, { ...decision, reviewHead: f.base }, out));
  assert.throws(() => prepareHandoff(run, { ...decision, status: 'proposed' }, out));
  prepareHandoff(run, decision, out);
  assert.equal(readJson(join(out, 'task.json')).findings[0].id, 'F1');
  assert.throws(() => prepareHandoff(run, decision, out));
  writeFileSync(join(run, 'trace.jsonl'), ' ');
  assert.ok(validateRun(run).errors.some((error) => error.includes('Changed artifact')));
});
test('verification records the tested source and refuses to replace previous logs', (t) => {
  const f = fixture(t),
    out = join(f.dir, 'verify');
  const { result } = verifyFix(f.checkout, out, ['verify']);
  assert.equal(result.status, 'passed');
  assert.equal(result.before.head, f.head);
  const digest = fileHash(join(out, 'verification.json'));
  assert.throws(() => verifyFix(f.checkout, out, ['verify']));
  assert.equal(fileHash(join(out, 'verification.json')), digest);
});

test('review shell preserves literal arguments and uses the pinned runtime without login startup', () => {
  const args = ["quote' dollar$ backtick`", 'line\nbreak', '$(exit 7)'];
  const output = execFileSync(
    '/bin/zsh',
    [
      '-c',
      shellCommand(process.execPath, [
        '-e',
        'console.log(JSON.stringify(process.argv.slice(1)))',
        ...args,
      ]),
    ],
    { encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(output), args);
  const { settings } = configuration('/tmp/review-checkout', ['.review-tmp']);
  assert.equal(settings.allow_login_shell, false);
  assert.equal(settings.shell_environment_policy.set.PATH, runtimePath);
  assert.equal(settings.shell_environment_policy.set.GIT_CONFIG_GLOBAL, '/dev/null');
  assert.equal(settings.shell_environment_policy.set.GIT_CONFIG_NOSYSTEM, '1');
});

test('A/B cannot pass with missing, empty or incomplete output', async (t) => {
  for (const variant of ['A', 'B']) {
    await t.test(variant, (t) => {
      const f = fixture(t),
        out = savedRun(f);
      const run = readJson(join(out, 'run.json'));
      run.variant = variant;
      delete run.artifacts['result.json'];
      const resultPath = join(out, 'result.txt');
      const tracePath = join(out, 'trace.jsonl');
      const persist = () => {
        run.artifacts['trace.jsonl'] = fileHash(tracePath);
        run.artifacts['result.txt'] = fileHash(resultPath);
        saveJson(join(out, 'run.json'), run);
      };
      writeFileSync(resultPath, 'No actionable defects were established.');
      persist();
      assert.deepEqual(validateRun(out).errors, []);
      writeFileSync(resultPath, '  ');
      persist();
      assert.ok(validateRun(out).errors.some((e) => e.includes('empty')));
      writeFileSync(resultPath, 'No actionable defects were established.');
      writeFileSync(tracePath, '{broken');
      persist();
      assert.ok(validateRun(out).errors.some((e) => e.includes('JSONL')));
      writeFileSync(tracePath, JSON.stringify({ type: 'turn.failed' }));
      persist();
      assert.ok(validateRun(out).errors.some((e) => e.includes('completed')));
      writeFileSync(tracePath, JSON.stringify({ type: 'turn.completed' }));
      persist();
      rmSync(resultPath);
      assert.ok(validateRun(out).errors.some((e) => e.includes('Unreadable artifact')));
    });
  }
});

function processOptions(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'review-process-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    cwd: dir,
    stdoutPath: join(dir, 'stdout.log'),
    stderrPath: join(dir, 'stderr.log'),
    timeoutMs: 3000,
    graceMs: 100,
  };
}

test('process execution preserves output and reports failure to launch', async (t) => {
  const options = processOptions(t);
  const result = await executeProcess(
    process.execPath,
    ['-e', 'console.log("saved"); console.error("diagnostic"); process.exitCode=7'],
    options,
  );
  assert.equal(result.status, 7);
  assert.equal(readFileSync(options.stdoutPath, 'utf8').trim(), 'saved');
  assert.equal(readFileSync(options.stderrPath, 'utf8').trim(), 'diagnostic');
  const failed = await executeProcess(join(options.cwd, 'missing-command'), [], {
    ...options,
    stdoutPath: join(options.cwd, 'missing.out'),
    stderrPath: join(options.cwd, 'missing.err'),
  });
  assert.equal(failed.error.code, 'ENOENT');
});

test('timeout terminates a process that ignores SIGTERM', async (t) => {
  const options = processOptions(t);
  const result = await executeProcess(
    process.execPath,
    ['-e', 'process.on("SIGTERM",()=>{}); console.log(process.pid); setInterval(()=>{},1000)'],
    { ...options, timeoutMs: 300 },
  );
  assert.equal(result.timedOut, true);
  assert.equal(result.signal, 'SIGKILL');
  const pid = Number(readFileSync(options.stdoutPath, 'utf8').trim());
  assert.throws(() => process.kill(pid, 0));
});

test('SIGINT stops the owned reviewer group and records interruption', async (t) => {
  const options = processOptions(t);
  const helper = new URL('../scripts/review/process.mjs', import.meta.url).href;
  const script = `
    import {executeProcess} from ${JSON.stringify(helper)};
    const result=await executeProcess(process.execPath,['-e','console.log(process.pid); setInterval(()=>{},1000)'],${JSON.stringify(options)});
    console.log(JSON.stringify(result));
  `;
  const supervisor = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    try {
      supervisor.kill('SIGKILL');
    } catch {
      /* Already exited. */
    }
  });
  let output = '';
  supervisor.stdout.on('data', (chunk) => {
    output += chunk;
  });
  const finished = new Promise((resolve, reject) => {
    supervisor.on('error', reject);
    supervisor.on('close', resolve);
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = Boolean(readFileSync(options.stdoutPath, 'utf8').trim());
    } catch {
      /* Starting. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(ready, 'Reviewer fixture did not start');
  supervisor.kill('SIGINT');
  assert.equal(await finished, 0);
  const result = JSON.parse(output);
  assert.equal(result.interruptedBy, 'SIGINT');
  const pid = Number(readFileSync(options.stdoutPath, 'utf8').trim());
  assert.throws(() => process.kill(pid, 0));
});

test('matrix preparation failure is recorded before a reviewer can start', (t) => {
  const f = fixture(t);
  const scripts = join(f.checkout, 'scripts/review');
  cpSync(new URL('../scripts/review', import.meta.url), scripts, {
    recursive: true,
  });
  cpSync(contractDir, join(f.checkout, 'docs/review'), { recursive: true });
  // Make the launcher importable while deliberately omitting the root dependency tree.
  symlinkSync(new URL('../node_modules', import.meta.url).pathname, join(scripts, 'node_modules'));
  for (const name of ['filters', 'edit', 'get'])
    saveJson(join(f.checkout, 'docs/review/examples', `${name}.json`), f.input);
  const out = join(f.checkout, '.review-runs/preparation-failure');
  const args = [join(scripts, 'matrix.mjs'), 'preflight', out];
  const failed = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(failed.status, 1);
  const manifest = readJson(join(out, 'matrix.json'));
  assert.equal(manifest.status, 'failed');
  assert.ok(manifest.finishedAt);
  assert.match(manifest.error, /node_modules/);
  assert.ok(manifest.runs.every((run) => run.status === 'pending'));
  const hash = fileHash(join(out, 'matrix.json'));
  assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 10000 }).status, 1);
  assert.equal(fileHash(join(out, 'matrix.json')), hash, 'Existing results were overwritten');
});

test('an exited reviewer cannot leave a descendant holding its output pipe open', async (t) => {
  const options = processOptions(t);
  const script = `
    const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});
    console.log(child.pid);
    setTimeout(()=>process.exit(0),100);
  `;
  const result = await executeProcess(process.execPath, ['-e', script], options);
  assert.equal(result.status, 0);
  assert.equal(result.timedOut, false);
});

test('command evidence accepts mixed shell quoting without executing or broadening the match', (t) => {
  const displayed =
    '/bin/zsh -c \'TMPDIR="$PWD/.review-tmp" node --test --test-name-pattern=\'"\'editing\' tests/integration/organizer.test.mjs"';
  const expected =
    'TMPDIR="$PWD/.review-tmp" node --test --test-name-pattern=\'editing\' tests/integration/organizer.test.mjs';
  assert.equal(commandBody(displayed), expected);
  for (const body of [
    'echo "hello"',
    "echo 'hello'",
    'printf "$PWD"',
    'echo $(exit 9)',
    'line\nbreak',
  ]) {
    assert.equal(commandBody(shellCommand('/bin/zsh', ['-c', body])), body);
  }
  for (const ambiguous of [
    "/bin/zsh -c 'unterminated",
    "/bin/zsh -c 'echo ok' extra",
    "/bin/zsh -c 'echo ok'; echo extra",
  ])
    assert.equal(commandBody(ambiguous), ambiguous);
  const f = fixture(t, { legacy: true });
  f.report.checks = [
    {
      id: 'blocked',
      command: expected,
      outcome: 'blocked',
      observation: 'Local binding denied',
      outputExcerpt: 'listen EPERM',
    },
  ];
  const event = {
    type: 'item.completed',
    item: {
      id: 'test',
      type: 'command_execution',
      command: displayed,
      exit_code: 1,
      aggregated_output: 'Error: listen EPERM',
    },
  };
  assert.deepEqual(f.validate(f.report, JSON.stringify(event)).errors, []);
  f.report.checks[0].command = expected.replace('organizer.test.mjs', 'unrelated.test.mjs');
  assert.ok(f.validate(f.report, JSON.stringify(event)).errors.length);
});

test('compact reports support static findings, questions, and no mandatory follow-ups', (t) => {
  const f = fixture(t);
  f.report.findings[0].followUps = [];
  f.report.requirementsQuestions = [
    {
      question: 'README.md and the PR description disagree on allowed values.',
      decisionNeeded: 'Which contract applies to the public export?',
    },
  ];
  assert.deepEqual(f.validate().errors, []);
  assert.equal(f.validate().executionEvidence, 'trace.jsonl');
  f.report.findings[0].location = {
    path: 'deleted.js',
    revision: 'base',
    startLine: 1,
    endLine: 1,
  };
  assert.deepEqual(f.validate().errors, []);
  f.report.findings = [];
  f.report.requirementsQuestions = [];
  assert.deepEqual(f.validate().errors, []);
});

test('compact report validation rejects bad locations, IDs and empty comments', (t) => {
  const f = fixture(t);
  for (const mutate of [
    (r) => {
      r.findings[0].body = ' ';
    },
    (r) => {
      r.findings[0].location.path = '../outside.js';
    },
    (r) => {
      r.findings[0].location.path = 'README.md';
    },
    (r) => {
      r.findings[0].location.endLine = 1000;
    },
    (r) => {
      r.findings[0].location.startLine = 2;
    },
    (r) => {
      r.findings.push(structuredClone(r.findings[0]));
    },
    (r) => {
      r.findings[0].followUps[0].acceptanceCondition = '';
    },
    (r) => {
      r.checks = [];
    },
  ]) {
    const report = structuredClone(f.report);
    mutate(report);
    assert.ok(f.validate(report).errors.length);
  }
  assert.ok(f.validate(f.report, '{broken').errors.length);
});

test('B and C share the same plain-text base input before focused stage instructions', () => {
  const input = {
    scope: { base: 'main', head: 'HEAD', comparison: 'direct' },
    prDescription: 'Preserve a public contract.\nKeep the existing consumer behavior.',
    contextDocuments: ['README.md', 'docs/PROJECT_SPEC.md'],
    reportedChecks: [
      {
        command: 'npm run check',
        result: 'passed in the reviewer sandbox',
        source: 'harness preflight: preflight-2.log',
      },
    ],
  };
  const prompt = compose('C', input);
  assert.equal(prompt, compose('B', input));
  assert.ok(prompt.startsWith(readFileSync(join(contractDir, 'review.md'), 'utf8').trim()));
  assert.ok(prompt.includes(readFileSync(join(contractDir, 'B-pr-context.md'), 'utf8').trim()));
  assert.ok(
    prompt.includes(
      'Base: main\nHead: HEAD\nComparison: Compare the base and head trees directly.',
    ),
  );
  assert.ok(prompt.includes(`## PR description\n\n${input.prDescription}`));
  assert.ok(prompt.includes('- README.md\n- docs/PROJECT_SPEC.md'));
  assert.ok(
    prompt.includes(
      'Command: npm run check\nResult: passed in the reviewer sandbox\nSource: harness preflight: preflight-2.log',
    ),
  );
  for (const variant of ['A', 'B', 'C']) {
    const text = compose(variant, input);
    for (const marker of [
      '## Review input',
      '## Output contract',
      '"prDescription"',
      '"scope"',
      '"reportedChecks"',
      '"additionalProperties"',
      '# Structured report',
    ])
      assert.ok(!text.includes(marker), `${variant} includes ${marker}`);
  }
  assert.ok(!compose('A', input).includes(input.prDescription));
});

test('plain-text composition preserves merge-base scope and supplied multiline values', () => {
  const input = {
    scope: { base: 'main', head: 'feature', comparison: 'merge_base' },
    prDescription: 'Keep the contract.',
    contextDocuments: [],
    reportedChecks: [
      {
        command: "node -e 'console.log(1)'",
        result: 'failed\nAssertion did not hold',
        source: 'author report',
      },
    ],
  };
  const prompt = compose('C', input);
  assert.equal(prompt, compose('B', input));
  assert.ok(prompt.includes('Compare head with the common ancestor of base and head.'));
  assert.ok(prompt.includes(input.reportedChecks[0].command));
  assert.ok(prompt.includes(input.reportedChecks[0].result));
  assert.ok(!prompt.includes('## Context documents'));
  assert.ok(!compose('C', { ...input, reportedChecks: [] }).includes('## Supplied checks'));
});

function investigation(f) {
  return {
    checks: [
      {
        id: 'K1',
        boundary: 'Public value export',
        expectation: 'Values remain positive.',
        basis: 'README.md:1',
        scenario: 'Read the changed export.',
        evidence: 'value.js:1 now exports a negative value.',
        outcome: 'suspected',
        openQuestion: '',
        location: f.report.findings[0].location,
      },
      {
        id: 'K2',
        boundary: 'Policy precedence',
        expectation: 'One policy should apply.',
        basis: 'Two conflicting policy statements.',
        scenario: 'The same request satisfies one policy but violates the other.',
        evidence: 'Source precedence is undocumented.',
        outcome: 'unresolved',
        openQuestion: 'Which policy applies?',
        location: null,
      },
    ],
    limitations: [],
  };
}

// C orchestration uses controlled outputs here. These tests never call a model.
async function focusedFixture(t, options = {}) {
  const f = fixture(t);
  const out = newDirectory(join(f.dir, 'focused'));
  const writable = ['.review-tmp', 'coverage'];
  writable.forEach((path) => mkdirSync(join(f.checkout, path), { recursive: true }));
  saveJson(join(out, 'input.json'), f.input);
  saveJson(join(out, 'output.schema.json'), f.schema);
  const run = {
    variant: 'C',
    scope: f.scope,
    checkout: f.checkout,
    sourceFingerprint: sourceFingerprint(f.checkout),
    timeoutSeconds: 900,
    model: 'gpt-6-sol',
    effort: 'medium',
    artifacts: {},
  };
  for (const name of ['input.json', 'output.schema.json'])
    run.artifacts[name] = fileHash(join(out, name));
  const candidate = investigation(f);
  const stagesSeen = [];
  let verification;
  const execute = async ({ dir, stageRun }) => {
    stagesSeen.push(stageRun.name);
    assert.ok(!existsSync(join(f.checkout, '.review-tmp/previous-stage')));
    assert.ok(!existsSync(join(f.checkout, '.review-tmp/review-notes.md')));
    writeFileSync(join(f.checkout, '.review-tmp/review-notes.md'), stageRun.name);
    assert.ok(!existsSync(join(f.checkout, 'coverage/previous-stage')));
    writeFileSync(join(f.checkout, '.review-tmp/previous-stage'), stageRun.name);
    writeFileSync(join(f.checkout, 'coverage/previous-stage'), stageRun.name);
    const prompt = readFileSync(join(dir, 'prompt.txt'), 'utf8');
    if (stageRun.name !== 'verification') assert.ok(!prompt.includes('### Candidate '));
    else {
      assert.ok(prompt.includes('### Candidate semantics:K1'));
      assert.ok(prompt.includes('### Candidate implementation:K1'));
    }
    stageRun.exit = 0;
    stageRun.usage = { input_tokens: 10, output_tokens: 5 };
    let result = structuredClone(candidate);
    if (stageRun.name === 'verification') {
      const candidates = collectCandidates({
        semantics: candidate,
        implementation: candidate,
      });
      verification = {
        report: structuredClone(f.report),
        additionalCandidates: [],
        dispositions: candidates.map((item) => ({
          candidateId: item.id,
          expectationBasis: item.value.outcome === 'suspected' ? 'documented' : 'unresolved',
          status: item.value.outcome === 'suspected' ? 'supported' : 'unresolved',
          findingId: item.value.outcome === 'suspected' ? 'F1' : null,
          questionIndex: item.value.outcome === 'suspected' ? null : 0,
          expectation: 'README.md requires positive values; the policies need clarification.',
          evidence: 'value.js line 1 exports a negative value.',
          reason:
            item.value.outcome === 'suspected'
              ? 'The source establishes the regression.'
              : 'The product owner must resolve conflicting requirements.',
        })),
      };
      verification.report.requirementsQuestions = [
        {
          question: 'Which policy applies?',
          decisionNeeded: 'Choose the governing policy.',
        },
      ];
      result = verification;
    }
    saveJson(join(dir, 'result.json'), result);
    writeFileSync(join(dir, 'stderr.log'), '');
    writeFileSync(
      join(dir, 'trace.jsonl'),
      JSON.stringify({ type: 'turn.completed', usage: stageRun.usage }) + '\n',
    );
    await options.onStage?.({ dir, stageRun, run, result });
  };
  const persist = () => saveJson(join(out, 'run.json'), run);
  const start = () =>
    runFocused({
      out,
      run,
      input: f.input,
      schema: f.schema,
      writable,
      execute,
      persist,
    });
  return {
    ...f,
    out,
    run,
    stagesSeen,
    start,
    getVerification: () => verification,
  };
}

test('C runs two isolated investigations then verifies all candidates and preserves compact handoff', async (t) => {
  const f = await focusedFixture(t);
  await f.start();
  assert.deepEqual(f.stagesSeen, focusedStages);
  assert.deepEqual(
    f.run.stages.map((stage) => stage.timeoutMs),
    [315000, 315000, 270000],
  );
  assert.deepEqual(f.run.usage, { input_tokens: 30, output_tokens: 15 });
  assert.deepEqual(validateRun(f.out).errors, []);
  const result = readJson(join(f.out, 'result.json'));
  assert.equal(result.findings.length, 1);
  assert.equal(result.requirementsQuestions.length, 1);
  assert.equal(readJson(join(f.out, 'dispositions.json')).length, 4);
  for (const stage of focusedStages)
    assert.equal(
      readFileSync(join(f.out, 'stages', stage, 'scratch/previous-stage'), 'utf8'),
      stage,
    );
  for (const stage of focusedStages)
    assert.equal(
      readFileSync(join(f.out, 'stages', stage, 'scratch/review-notes.md'), 'utf8'),
      stage,
    );
  const trace = readFileSync(join(f.out, 'trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(
    trace.map((event) => event.reviewStage),
    focusedStages,
  );
  assert.equal(
    readFileSync(join(f.out, 'prompt.txt'), 'utf8'),
    readFileSync(join(f.out, 'stages/verification/prompt.txt'), 'utf8'),
  );
  const handoff = prepareHandoff(
    f.out,
    {
      status: 'accepted',
      reviewHead: f.head,
      resultSha256: fileHash(join(f.out, 'result.json')),
      reason: 'Confirmed from source.',
      findingIds: ['F1'],
      changeScope: ['value.js'],
      preserve: ['Positive values'],
      acceptance: ['A regression fails before correction and passes afterward.'],
    },
    join(f.dir, 'focused-handoff'),
  );
  assert.equal(readJson(join(handoff, 'task.json')).findings[0].id, 'F1');
});

test('C rejects incomplete, duplicate and invented candidate dispositions and unsupported final comments', (t) => {
  const f = fixture(t);
  const candidates = [{ id: 'semantics:K1', value: investigation(f).checks[0] }];
  const valid = {
    report: f.report,
    additionalCandidates: [],
    dispositions: [
      {
        candidateId: 'semantics:K1',
        status: 'supported',
        findingId: 'F1',
        questionIndex: null,
        expectation: 'Values must be positive (README.md).',
        evidence: 'value.js:1 exports a negative value.',
        reason: 'Source evidence.',
      },
    ],
  };
  for (const mutate of [
    (r) => {
      r.dispositions = [];
    },
    (r) => {
      r.dispositions.push(r.dispositions[0]);
    },
    (r) => {
      r.dispositions[0].candidateId = 'unknown';
    },
    (r) => {
      r.dispositions[0].findingId = 'unknown';
    },
    (r) => {
      r.dispositions[0].status = 'disproved';
    },
    (r) => {
      r.dispositions[0].status = 'disproved';
      r.dispositions[0].findingId = null;
    },
  ]) {
    const result = structuredClone(valid);
    mutate(result);
    assert.throws(() => finalizeVerification(candidates, result));
  }
  const unresolved = structuredClone(valid);
  unresolved.report.findings = [];
  unresolved.dispositions[0].status = 'unresolved';
  unresolved.dispositions[0].findingId = null;
  assert.match(
    finalizeVerification(candidates, unresolved).limitations[0],
    /Unresolved candidate semantics:K1/,
  );
  unresolved.dispositions[0].status = 'disproved';
  assert.deepEqual(finalizeVerification(candidates, unresolved).findings, []);
});

test('C stops on failed stages and keeps their artifacts without publishing a report', async (t) => {
  for (const mode of ['exit', 'timeout', 'interrupt', 'trace', 'schema', 'source', 'disposition']) {
    await t.test(mode, async (t) => {
      const f = await focusedFixture(t, {
        onStage: ({ dir, stageRun, run, result }) => {
          if (stageRun.name !== (mode === 'disposition' ? 'verification' : 'implementation'))
            return;
          if (mode === 'exit') stageRun.exit = 1;
          if (mode === 'timeout') stageRun.timedOut = true;
          if (mode === 'interrupt') {
            const error = new Error('Interrupted.');
            error.interruptedBy = 'SIGINT';
            throw error;
          }
          if (mode === 'trace') writeFileSync(join(dir, 'trace.jsonl'), '{bad trace');
          if (mode === 'schema') saveJson(join(dir, 'result.json'), {});
          if (mode === 'source') writeFileSync(join(run.checkout, 'value.js'), 'changed source');
          if (mode === 'disposition') {
            result.dispositions.pop();
            saveJson(join(dir, 'result.json'), result);
          }
        },
      });
      await assert.rejects(f.start());
      assert.equal(f.stagesSeen.length, mode === 'disposition' ? 3 : 2);
      assert.equal(f.run.stages.at(-1).status, mode === 'interrupt' ? 'interrupted' : 'failed');
      assert.ok(existsSync(join(f.out, 'stages/implementation/result.json')));
      assert.ok(!existsSync(join(f.out, 'result.json')));
      assert.ok(validateRun(f.out).errors.length);
    });
  }
});

test('C rejects inconsistent expectation decisions before publishing and preserves the failed evidence', async (t) => {
  const cases = [
    [
      'ambiguous expectation published',
      (d) => {
        d.expectationBasis = 'unresolved';
      },
      /established expectation/,
    ],
    [
      'unsupported expectation published',
      (d) => {
        d.expectationBasis = 'unsupported';
      },
      /established expectation/,
    ],
    [
      'intent hidden as a technical limit',
      (d) => {
        d.expectationBasis = 'unresolved';
        d.status = 'unresolved';
        d.findingId = null;
      },
      /linked requirements question/,
    ],
    [
      'unsupported preference escalated to a question',
      (d) => {
        d.expectationBasis = 'unsupported';
        d.status = 'unresolved';
        d.findingId = null;
        d.questionIndex = 0;
      },
      /unsupported expectation/,
    ],
    [
      'invalid intent question link',
      (d) => {
        d.expectationBasis = 'unresolved';
        d.status = 'unresolved';
        d.findingId = null;
        d.questionIndex = 99;
      },
      /invalid question index/,
    ],
    [
      'missing expectation basis',
      (d) => {
        delete d.expectationBasis;
      },
      /expectationBasis/,
    ],
  ];
  for (const [name, mutate, error] of cases) {
    await t.test(name, async (t) => {
      const f = await focusedFixture(t, {
        onStage: ({ dir, stageRun, result }) => {
          if (stageRun.name !== 'verification') return;
          mutate(result.dispositions[0]);
          saveJson(join(dir, 'result.json'), result);
        },
      });
      await assert.rejects(f.start(), error);
      assert.equal(f.run.stages.at(-1).status, 'failed');
      assert.ok(existsSync(join(f.out, 'stages/verification/result.json')));
      assert.ok(!existsSync(join(f.out, 'result.json')));
    });
  }
});

test('C permits inferred defects, resolved intent, technical limits and refuted preferences', (t) => {
  const f = fixture(t);
  const candidate = { id: 'implementation:K2', value: investigation(f).checks[1] };
  const verification = {
    report: structuredClone(f.report),
    additionalCandidates: [],
    dispositions: [
      {
        candidateId: candidate.id,
        expectationBasis: 'inferred',
        expectation:
          'The consumer requires a valid positive result, though the specification is silent.',
        evidence: 'The supplied value reaches a consumer which cannot accept a negative value.',
        reason: 'The concrete failure is independent of the policy choice in the open question.',
        status: 'supported',
        findingId: 'F1',
        questionIndex: null,
      },
    ],
  };
  assert.deepEqual(
    validateShape(verification, verificationSchema(f.schema, [candidate.id], true)),
    [],
  );
  assert.equal(finalizeVerification([candidate], verification, {}, true).findings.length, 1);
  // Initially unresolved candidates are eligible when new evidence establishes the obligation.
  const d = verification.dispositions[0];
  d.expectationBasis = 'documented';
  d.expectation = 'The approved amendment takes precedence and requires positive values.';
  d.reason = 'The amendment explicitly answers which policy applies.';
  assert.equal(finalizeVerification([candidate], verification, {}, true).findings.length, 1);

  verification.report.findings = [];
  d.status = 'unresolved';
  d.findingId = null;
  d.reason = 'The obligation is established but the consumer trace is incomplete.';
  assert.match(
    finalizeVerification([candidate], verification, {}, true).limitations[0],
    /trace is incomplete/,
  );

  d.expectationBasis = 'unresolved';
  d.questionIndex = 0;
  verification.report.requirementsQuestions = [
    { question: 'Which policy applies?', decisionNeeded: 'Resolve precedence.' },
  ];
  const unresolved = finalizeVerification([candidate], verification, {}, true);
  assert.equal(unresolved.requirementsQuestions.length, 1);
  assert.deepEqual(unresolved.limitations, []);

  verification.report.requirementsQuestions = [];
  d.expectationBasis = 'unsupported';
  d.status = 'disproved';
  d.questionIndex = null;
  d.reason = 'No obligation or concrete consequence supports this preference.';
  assert.deepEqual(finalizeVerification([candidate], verification, {}, true), {
    findings: [],
    requirementsQuestions: [],
    limitations: [],
  });
  assert.deepEqual(
    finalizeVerification(
      [],
      {
        report: verification.report,
        additionalCandidates: [],
        dispositions: [],
      },
      {},
      true,
    ),
    verification.report,
  );
});

test('saved C expectation decisions are checked even if contradictory artifacts are rehashed', async (t) => {
  const f = await focusedFixture(t);
  await f.start();
  const verification = readJson(join(f.out, 'stages/verification/result.json'));
  verification.dispositions[0].expectationBasis = 'unresolved';
  saveJson(join(f.out, 'stages/verification/result.json'), verification);
  saveJson(join(f.out, 'dispositions.json'), verification.dispositions);
  for (const name of ['stages/verification/result.json', 'dispositions.json'])
    f.run.artifacts[name] = fileHash(join(f.out, name));
  saveJson(join(f.out, 'run.json'), f.run);
  assert.ok(validateRun(f.out).errors.some((error) => error.includes('established expectation')));
});

test('C validation checks stage lineage even when altered artifacts are rehashed', async (t) => {
  const f = await focusedFixture(t);
  await f.start();
  const candidatesPath = join(f.out, 'candidates.json');
  saveJson(candidatesPath, []);
  f.run.artifacts['candidates.json'] = fileHash(candidatesPath);
  saveJson(join(f.out, 'run.json'), f.run);
  assert.ok(validateRun(f.out).errors.some((error) => error.includes('candidates.json')));
  delete f.run.artifacts['stages/semantics/prompt.txt'];
  saveJson(join(f.out, 'run.json'), f.run);
  assert.ok(validateRun(f.out).errors.some((error) => error.includes('Missing recorded artifact')));
});

test('C can complete with zero candidates and does not require agreement between investigations', (t) => {
  const f = fixture(t);
  const empty = { findings: [], requirementsQuestions: [], limitations: [] };
  assert.deepEqual(
    finalizeVerification([], {
      report: empty,
      additionalCandidates: [],
      dispositions: [],
    }),
    empty,
  );
  const candidates = collectCandidates({
    semantics: { checks: [investigation(f).checks[0]], limitations: [] },
    implementation: { checks: [], limitations: [] },
  });
  assert.equal(candidates.length, 1);
  assert.deepEqual(
    finalizeVerification(candidates, {
      report: f.report,
      additionalCandidates: [],
      dispositions: [
        {
          candidateId: candidates[0].id,
          status: 'supported',
          findingId: 'F1',
          questionIndex: null,
          expectation: 'Positive values (README.md).',
          evidence: 'Negative value exported by value.js:1.',
          reason: 'Complete code trace.',
        },
      ],
    }),
    f.report,
  );
});

test('C resets writable output without touching tracked source', (t) => {
  const f = fixture(t);
  assert.throws(() => resetWritable(f.checkout, ['../escape']));
  assert.throws(() => resetWritable(f.checkout, ['README.md']));
  assert.equal(
    readFileSync(join(f.checkout, 'README.md'), 'utf8'),
    'Values must remain positive.\n',
  );
});

test('C stage prompts keep B context, narrow the investigation and omit outcome hints', () => {
  const input = {
    scope: { base: 'main', head: 'HEAD', comparison: 'direct' },
    prDescription: 'Neutral change purpose.',
    contextDocuments: [],
    reportedChecks: [],
  };
  for (const stage of focusedStages) {
    const text = composeFocused(stage, input);
    assert.ok(text.includes(composeContext('C', input).trim()));
    if (stage === 'verification')
      assert.ok(text.includes(readFileSync(join(contractDir, 'C-verification.md'), 'utf8').trim()));
    else {
      assert.ok(text.includes(input.prDescription));
      assert.ok(!text.includes('## Select actionable findings'));
      assert.ok(!text.includes('Return every distinct supported finding'));
      assert.ok(text.includes('Retain concrete hypotheses'));
    }
    assert.ok(!text.includes('"prDescription"'));
    for (const hint of ['after Continue', 'editTarget', 'participantName', 'pendingReads'])
      assert.ok(!text.includes(hint));
  }
  assert.throws(() => composeFocused('unknown', input));
  const config = configuration('/tmp/checkout', ['.review-tmp']);
  const args = reviewArgs(
    { checkout: '/tmp/checkout', model: 'gpt-6-sol', effort: 'medium' },
    config,
    '/tmp/result.json',
    '/tmp/schema.json',
  );
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('--output-schema'));
  assert.ok(args.includes('memories'));
  assert.ok(args.includes('multi_agent'));
});

test('discovery retains uncertain hypotheses without forcing final comments and validates source anchors', (t) => {
  const f = fixture(t);
  const report = investigation(f);
  const options = { checkout: f.checkout, scope: f.scope, schema: f.schema };
  assert.deepEqual(validateDiscovery(report, options), []);
  for (const mutate of [
    (r) => {
      r.checks[0].evidence = '';
    },
    (r) => {
      r.checks[1].openQuestion = '';
    },
    (r) => {
      r.checks[1].id = r.checks[0].id;
    },
    (r) => {
      r.checks[0].location.path = '../outside';
    },
    (r) => {
      r.checks[0].location.endLine = 500;
    },
    (r) => {
      r.checks[0].location.startLine = 5;
    },
    (r) => {
      r.checks[0].outcome = 'confirmed';
    },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    assert.ok(validateDiscovery(invalid, options).length);
  }
  // Discovery can cite a contract outside the diff. Final comments still need diff anchors.
  report.checks[0].location.path = 'README.md';
  assert.deepEqual(validateDiscovery(report, options), []);
  report.checks.push({ ...report.checks[0], id: 'K3', outcome: 'refuted' });
  report.checks.push({
    ...report.checks[0],
    id: 'K4',
    outcome: 'not_checked',
    evidence: 'Probe blocked by the environment.',
  });
  const reports = {
    semantics: report,
    implementation: { checks: [], limitations: [] },
  };
  assert.equal(collectChecks(reports).length, 4);
  assert.equal(collectCandidates(reports).length, 2);
});

test('verification consolidates differently worded questions by explicit links and preserves unverified checks', (t) => {
  const f = fixture(t);
  const reports = {
    semantics: investigation(f),
    implementation: investigation(f),
  };
  reports.semantics.checks = [reports.semantics.checks[1]];
  reports.implementation.checks = [
    {
      ...reports.implementation.checks[1],
      openQuestion: 'May the newer policy override the old one?',
    },
  ];
  reports.implementation.checks.push({
    ...reports.implementation.checks[0],
    id: 'K3',
    outcome: 'not_checked',
    evidence: 'Time budget ended before tracing the other path.',
  });
  const candidates = collectCandidates(reports);
  const verification = {
    report: {
      findings: [],
      requirementsQuestions: [
        {
          question: 'Which policy governs this request?',
          decisionNeeded: 'Confirm precedence.',
        },
      ],
      limitations: [],
    },
    additionalCandidates: [],
    dispositions: candidates.map(({ id }) => ({
      candidateId: id,
      status: 'unresolved',
      findingId: null,
      questionIndex: 0,
      expectation: 'Contradictory documented policies.',
      evidence: 'No stated precedence.',
      reason: 'Engineer decision required.',
    })),
  };
  const final = finalizeVerification(candidates, verification, reports);
  assert.equal(final.requirementsQuestions.length, 1);
  assert.match(final.limitations[0], /implementation:K3 not checked/);
  for (const invalid of [-1, 1, 0.5]) {
    const v = structuredClone(verification);
    v.dispositions[0].questionIndex = invalid;
    assert.throws(() => finalizeVerification(candidates, v, reports));
  }
});

test('verification can introduce an attributable issue and requires expectation and evidence for every decision', async (t) => {
  const f = await focusedFixture(t, {
    onStage: ({ stageRun, dir, result }) => {
      if (stageRun.name !== 'verification') return;
      result.additionalCandidates = [
        { ...investigation({ report: result.report }).checks[0], id: 'NEW' },
      ];
      result.dispositions.push({
        ...result.dispositions[0],
        candidateId: 'verification:NEW',
      });
      saveJson(join(dir, 'result.json'), result);
    },
  });
  await f.start();
  assert.deepEqual(validateRun(f.out).errors, []);
  assert.equal(readJson(join(f.out, 'candidates.json')).at(-1).id, 'verification:NEW');
  const v = readJson(join(f.out, 'stages/verification/result.json'));
  const candidates = collectCandidates({
    semantics: investigation(f),
    implementation: investigation(f),
  });
  assert.equal(withAdditionalCandidates(candidates, v).length, 5);
  for (const field of ['expectation', 'evidence']) {
    const invalid = structuredClone(v);
    invalid.dispositions[0][field] = '';
    assert.ok(validateShape(invalid, verificationSchema(f.schema)).length);
  }
  const incomplete = structuredClone(v);
  incomplete.dispositions.pop();
  assert.throws(() => finalizeVerification(candidates, incomplete));
  const duplicate = structuredClone(v);
  duplicate.additionalCandidates.push(duplicate.additionalCandidates[0]);
  assert.throws(() => finalizeVerification(candidates, duplicate));
  const nonCandidate = structuredClone(v);
  nonCandidate.additionalCandidates[0].outcome = 'refuted';
  assert.throws(() => finalizeVerification(candidates, nonCandidate));
  const unsupported = structuredClone(v);
  unsupported.dispositions.forEach((d) => {
    if (d.findingId === 'F1') {
      d.status = 'disproved';
      d.findingId = null;
    }
  });
  assert.throws(() => finalizeVerification(candidates, unsupported));
});

test('focused-v1 artifacts still validate using their historical contract', async (t) => {
  const legacy = await import('../scripts/review/focused-v1.mjs');
  const f = await focusedFixture(t);
  await f.start();
  const report = structuredClone(f.report);
  delete report.findings[0].followUps;
  const candidates = legacy.collectCandidates({
    semantics: report,
    implementation: report,
  });
  const verification = {
    report: f.report,
    dispositions: candidates.map(({ id }) => ({
      candidateId: id,
      status: 'supported',
      findingId: 'F1',
      reason: 'Source establishes the defect.',
    })),
  };
  for (const stage of focusedStages) {
    saveJson(
      join(f.out, 'stages', stage, 'output.schema.json'),
      stage === 'verification'
        ? legacy.verificationSchema(f.schema)
        : legacy.discoverySchema(f.schema),
    );
    saveJson(
      join(f.out, 'stages', stage, 'result.json'),
      stage === 'verification' ? verification : report,
    );
  }
  saveJson(join(f.out, 'candidates.json'), candidates);
  saveJson(join(f.out, 'dispositions.json'), verification.dispositions);
  saveJson(join(f.out, 'result.json'), legacy.finalizeVerification(candidates, verification));
  f.run.workflow = 'focused-v1';
  delete f.run.artifacts['checks.json'];
  rmSync(join(f.out, 'checks.json'));
  for (const name of Object.keys(f.run.artifacts))
    f.run.artifacts[name] = fileHash(join(f.out, name));
  saveJson(join(f.out, 'run.json'), f.run);
  assert.deepEqual(validateRun(f.out).errors, []);
});

test('stage schemas use required strict objects and no extra properties at every object boundary', (t) => {
  const f = fixture(t);
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'object') {
      assert.equal(value.additionalProperties, false);
      assert.deepEqual([...value.required].sort(), Object.keys(value.properties).sort());
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(discoverySchema(f.schema));
  visit(verificationSchema(f.schema));
  visit(verificationSchema(f.schema, [], true));
});

test('verification receives negative check evidence without sharing it between investigators', (t) => {
  const f = fixture(t);
  const reports = { semantics: investigation(f), implementation: investigation(f) };
  reports.semantics.checks.push({
    ...reports.semantics.checks[0],
    id: 'NEGATIVE',
    outcome: 'refuted',
    scenario: 'A distinctive single-path probe.',
    evidence: 'Only this path was inspected.',
  });
  const candidates = collectCandidates(reports);
  const prompt = composeFocused('verification', f.input, candidates, reports);
  assert.ok(prompt.includes('### Check semantics:NEGATIVE'));
  assert.ok(prompt.includes('A distinctive single-path probe.'));
  assert.ok(prompt.includes('Only this path was inspected.'));
  assert.equal(prompt.split('### Candidate semantics:K1').length - 1, 1);
  assert.ok(!candidates.some((candidate) => candidate.id === 'semantics:NEGATIVE'));
  for (const stage of ['semantics', 'implementation']) {
    const independent = composeFocused(stage, f.input, candidates, reports);
    assert.ok(!independent.includes('A distinctive single-path probe.'));
    assert.ok(!independent.includes('### Candidate '));
    assert.ok(!independent.includes('### Check semantics:NEGATIVE'));
  }
});

test('focused handoff preserves distinct merged scenarios and excludes unselected or unresolved proposals', async (t) => {
  const f = await focusedFixture(t, {
    onStage: ({ stageRun, dir, result }) => {
      if (stageRun.name === 'implementation') {
        result.checks[0].scenario =
          'An independent consumer reaches the same failure through another trigger.';
      }
      if (stageRun.name === 'verification') {
        result.report.findings.push({
          ...result.report.findings[0],
          id: 'F2',
          title: 'Another issue outside the accepted scope',
        });
        const check = investigation({ report: result.report }).checks[0];
        result.additionalCandidates.push({ ...check, id: 'EXTRA' }, { ...check, id: 'REJECTED' });
        result.dispositions.push(
          { ...result.dispositions[0], candidateId: 'verification:EXTRA', findingId: 'F2' },
          {
            ...result.dispositions[0],
            candidateId: 'verification:REJECTED',
            status: 'disproved',
            findingId: null,
          },
        );
      }
      saveJson(join(dir, 'result.json'), result);
    },
  });
  await f.start();
  const decision = {
    status: 'accepted',
    reviewHead: f.head,
    resultSha256: fileHash(join(f.out, 'result.json')),
    reason: 'F1 confirmed; F2 remains outside the approved scope.',
    findingIds: ['F1'],
    changeScope: ['value.js'],
    preserve: ['Positive values'],
    acceptance: ['Both triggering paths return a positive value.'],
  };
  const dir = prepareHandoff(f.out, decision, join(f.dir, 'scenario-handoff'));
  const task = readJson(join(dir, 'task.json'));
  assert.deepEqual(
    task.findings.map((finding) => finding.id),
    ['F1'],
  );
  assert.deepEqual(
    task.supportingCandidates.map((candidate) => candidate.candidateId),
    ['semantics:K1', 'implementation:K1'],
  );
  assert.equal(
    task.supportingCandidates[1].proposal.scenario,
    'An independent consumer reaches the same failure through another trigger.',
  );
  assert.ok(task.supportingCandidates.every((candidate) => candidate.findingId === 'F1'));
  assert.equal(task.review.candidatesSha256, fileHash(join(f.out, 'candidates.json')));
  assert.equal(task.review.dispositionsSha256, fileHash(join(f.out, 'dispositions.json')));
  const prompt = readFileSync(join(dir, 'prompt.txt'), 'utf8');
  assert.ok(prompt.includes('each trigger to an expected behavior and a regression assertion'));
  assert.ok(prompt.includes('A diagnostic probe may pass because it asserts the observed bug'));
  assert.ok(!prompt.includes('verification:EXTRA'));
  // Corrupted evidence cannot enter a new handoff even when the final report is unchanged.
  saveJson(join(f.out, 'candidates.json'), []);
  assert.throws(() => prepareHandoff(f.out, decision, join(f.dir, 'tampered-handoff')));
});

test('historical focused variants retain schemas and decisions without expectation classification', async (t) => {
  const f = await focusedFixture(t);
  await f.start();
  assert.equal(f.run.workflow, 'focused-v3-expectation-gate');
  const verification = readJson(join(f.out, 'stages/verification/result.json'));
  for (const disposition of verification.dispositions) delete disposition.expectationBasis;
  saveJson(join(f.out, 'stages/verification/result.json'), verification);
  saveJson(join(f.out, 'dispositions.json'), verification.dispositions);
  for (const name of ['stages/verification/result.json', 'dispositions.json'])
    f.run.artifacts[name] = fileHash(join(f.out, name));
  const schemaFile = 'stages/verification/output.schema.json';
  for (const workflow of [
    'focused-v2',
    'focused-v3',
    'focused-v3-efficient',
    'focused-v3-exploratory',
    'focused-v3-exploratory-ids',
  ]) {
    const ids =
      workflow === 'focused-v3-exploratory-ids'
        ? readJson(join(f.out, 'candidates.json')).map(({ id }) => id)
        : null;
    saveJson(join(f.out, schemaFile), verificationSchema(f.schema, ids));
    f.run.artifacts[schemaFile] = fileHash(join(f.out, schemaFile));
    f.run.workflow = workflow;
    saveJson(join(f.out, 'run.json'), f.run);
    assert.deepEqual(validateRun(f.out).errors, []);
  }
  delete f.run.artifacts['checks.json'];
  saveJson(join(f.out, 'run.json'), f.run);
  assert.ok(
    validateRun(f.out).errors.some((error) =>
      error.includes('Missing recorded artifact: checks.json'),
    ),
  );
});

test('C keeps stable procedures before complete case context without duplicating B in verification', (t) => {
  const f = fixture(t);
  const alternate = {
    ...f.input,
    scope: { ...f.input.scope, base: 'another-base', head: 'another-head' },
    prDescription: 'A different request. Preserve all supplied detail.',
  };
  for (const stage of focusedStages) {
    const prompt = composeFocused(stage, f.input);
    const next = composeFocused(stage, alternate);
    const contextStart = prompt.indexOf('## Review scope');
    assert.ok(contextStart > 0);
    assert.equal(prompt.slice(0, contextStart), next.slice(0, next.indexOf('## Review scope')));
    assert.ok(prompt.includes(composeContext('C', f.input).trim()));
    assert.ok(next.includes(composeContext('C', alternate).trim()));
    assert.ok(
      prompt.indexOf(readFileSync(join(contractDir, `C-${stage}.md`), 'utf8').trim()) <
        contextStart,
    );
    assert.equal(prompt.split('# Review the committed change').length - 1, 1);
  }
  const verifier = composeFocused('verification', f.input);
  assert.ok(!verifier.includes(readFileSync(join(contractDir, 'review.md'), 'utf8').trim()));
  assert.ok(!verifier.includes(readFileSync(join(contractDir, 'B-pr-context.md'), 'utf8').trim()));
  assert.ok(!verifier.includes(readFileSync(join(contractDir, 'C-investigate.md'), 'utf8').trim()));
});

test('efficient verification preserves long evidence, refutations, unresolved and unchecked records', (t) => {
  const f = fixture(t);
  const reports = { semantics: investigation(f), implementation: investigation(f) };
  reports.semantics.checks[0].evidence = 'source-observation '.repeat(2000) + 'END_OF_EVIDENCE';
  reports.implementation.checks.push(
    { ...reports.implementation.checks[0], id: 'NEGATIVE', outcome: 'refuted' },
    {
      ...reports.implementation.checks[0],
      id: 'BLOCKED',
      outcome: 'not_checked',
      evidence: 'Exact verification limit: command could not bind a port.',
    },
  );
  reports.semantics.limitations.push('Supplied result does not cover this boundary.');
  const candidates = collectCandidates(reports);
  const prompt = composeFocused('verification', f.input, candidates, reports);
  for (const { id, value } of [
    ...candidates,
    { id: 'implementation:NEGATIVE', value: reports.implementation.checks[2] },
  ]) {
    assert.ok(prompt.includes(id));
    for (const key of [
      'boundary',
      'expectation',
      'basis',
      'scenario',
      'evidence',
      'outcome',
      'openQuestion',
    ])
      if (value[key]) assert.ok(prompt.includes(value[key]), `${id}: ${key} lost`);
  }
  assert.ok(prompt.includes('implementation:BLOCKED not checked'));
  assert.ok(prompt.includes('Exact verification limit: command could not bind a port.'));
  assert.ok(prompt.includes(reports.semantics.limitations[0]));
});

test('runtime verifier schema excludes negative audit IDs and preserves new verifier candidates', (t) => {
  const f = fixture(t);
  const check = investigation(f).checks[0];
  const candidate = { id: 'semantics:K1', value: check };
  const disposition = {
    candidateId: candidate.id,
    status: 'supported',
    findingId: 'F1',
    questionIndex: null,
    expectation: check.expectation,
    evidence: check.evidence,
    reason: 'Confirmed from source.',
  };
  const result = { report: f.report, additionalCandidates: [], dispositions: [disposition] };
  const schema = verificationSchema(f.schema, [candidate.id]);
  assert.deepEqual(validateShape(result, schema), []);
  for (const id of [
    'semantics:REFUTED',
    'implementation:UNKNOWN',
    'verification:',
    'verification:invalid id',
  ]) {
    const bad = structuredClone(result);
    bad.dispositions[0].candidateId = id;
    assert.ok(validateShape(bad, schema).length, id);
  }
  const added = structuredClone(result);
  added.additionalCandidates = [{ ...check, id: 'NEW' }];
  added.dispositions[0].candidateId = 'verification:NEW';
  assert.deepEqual(validateShape(added, verificationSchema(f.schema, [])), []);
  assert.equal(finalizeVerification([], added).findings.length, 1);
  added.additionalCandidates = [];
  assert.throws(() => finalizeVerification([], added), /Unknown or duplicate/);
  assert.ok(validateShape(result, verificationSchema(f.schema, [])).length);
  const historical = structuredClone(result);
  historical.dispositions[0].candidateId = 'unrestricted-legacy-id';
  assert.deepEqual(validateShape(historical, verificationSchema(f.schema)), []);
});

test('negative audit disposition is rejected by the runtime schema before report publication', async (t) => {
  const f = await focusedFixture(t, {
    onStage: ({ stageRun, dir, result }) => {
      if (stageRun.name === 'semantics')
        result.checks.push({ ...result.checks[0], id: 'NEGATIVE', outcome: 'refuted' });
      if (stageRun.name === 'verification') {
        const schema = readJson(join(dir, 'output.schema.json'));
        const extra = {
          ...result.dispositions[0],
          candidateId: 'semantics:NEGATIVE',
          status: 'disproved',
          findingId: null,
          questionIndex: null,
        };
        result.dispositions.push(extra);
        assert.ok(validateShape(result, schema).length);
      }
      saveJson(join(dir, 'result.json'), result);
    },
  });
  await assert.rejects(f.start());
  assert.equal(f.run.stages.at(-1).status, 'failed');
  assert.ok(!existsSync(join(f.out, 'result.json')));
  assert.ok(existsSync(join(f.out, 'stages/verification/result.json')));
});

function matrixFixture(t, count = 6) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'review-matrix-')));
  const workerPath = join(root, 'worker.mjs');
  const workerModule = new URL('../scripts/review/matrix-worker.mjs', import.meta.url).href;
  const processModule = new URL('../scripts/review/process.mjs', import.meta.url).href;
  writeFileSync(
    workerPath,
    `
    import {startMatrixWorker} from ${JSON.stringify(workerModule)};
    import {executeProcess} from ${JSON.stringify(processModule)};
    import {mkdirSync, writeFileSync} from 'node:fs';
    import {join} from 'node:path';
    startMatrixWorker(async ({output, input, signal}) => {
      mkdirSync(output);
      writeFileSync(join(output, 'worker.json'), JSON.stringify({pid:process.pid, input, model:process.env.WORKSHOP_REVIEW_MODEL}));
      console.log(input.id);
      const script = \`
        const fs = require('node:fs');
        fs.writeFileSync('child.pid', String(process.pid));
        fs.writeFileSync('scratch.txt', process.env.JOB_ID);
        if (process.env.JOB_MODE === 'finish') setTimeout(() => {}, 200);
        else setInterval(() => {
          if (process.env.JOB_MODE === 'fail' && fs.existsSync('fail-now')) process.exit(3);
        }, 20);
      \`;
      const result = await executeProcess(process.execPath, ['-e', script], {
        cwd:output, env:{...process.env, JOB_ID:input.id, JOB_MODE:input.mode}, signal,
        stdoutPath:join(output,'child.stdout'), stderrPath:join(output,'child.stderr'), timeoutMs:15000,
      });
      if (result.status !== 0 || result.interruptedBy) {
        const error = new Error('Fixture child stopped');
        error.interruptedBy = result.interruptedBy;
        throw error;
      }
    });
  `,
  );
  const jobs = Array.from({ length: count }, (_, i) => {
    const id = `job-${i}`;
    return {
      id,
      record: {
        status: 'pending',
        stdoutLog: join(root, `${id}.stdout`),
        stderrLog: join(root, `${id}.stderr`),
      },
      options: { source: root, output: join(root, id), input: { id, mode: 'finish' } },
    };
  });
  // Emergency test cleanup must not leave fixtures running if an assertion fails.
  t.after(() => {
    for (const job of jobs) {
      for (const pid of [
        job.record.pid,
        Number(
          existsSync(join(job.options.output, 'child.pid')) &&
            readFileSync(join(job.options.output, 'child.pid'), 'utf8'),
        ),
      ]) {
        if (pid)
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            /* Exited. */
          }
      }
    }
    rmSync(root, { recursive: true, force: true });
  });
  return { root, jobs, workerPath };
}

async function waitForMatrixChildren(jobs) {
  for (let i = 0; i < 200; i++) {
    if (jobs.every((job) => existsSync(join(job.options.output, 'child.pid')))) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail('Matrix fixture processes did not start');
}

test('matrix runs bounded, separate worker processes with isolated outputs and fixed settings', async (t) => {
  const f = matrixFixture(t);
  let maximum = 0;
  await runMatrixJobs(f.jobs, {
    workerPath: f.workerPath,
    concurrency: 2,
    env: { ...process.env, WORKSHOP_REVIEW_MODEL: 'fixture-model' },
    onChange: () => {
      maximum = Math.max(maximum, f.jobs.filter((job) => job.record.status === 'running').length);
      assert.ok(maximum <= 2);
    },
  });
  assert.equal(maximum, 2);
  assert.equal(new Set(f.jobs.map((job) => job.record.pid)).size, f.jobs.length);
  for (const job of f.jobs) {
    assert.equal(job.record.status, 'completed');
    const worker = readJson(join(job.options.output, 'worker.json'));
    assert.equal(worker.pid, job.record.pid);
    assert.equal(worker.model, 'fixture-model');
    assert.deepEqual(worker.input, job.options.input);
    assert.equal(readFileSync(join(job.options.output, 'scratch.txt'), 'utf8'), job.id);
    assert.equal(readFileSync(job.record.stdoutLog, 'utf8').trim(), job.id);
    assert.throws(() => process.kill(worker.pid, 0));
  }
});

test('matrix failure cancels active workers and their children without dispatching queued jobs', async (t) => {
  const f = matrixFixture(t, 4);
  f.jobs[0].options.input.mode = 'fail';
  f.jobs[1].options.input.mode = 'hold';
  const pending = runMatrixJobs(f.jobs, { workerPath: f.workerPath, concurrency: 2 }).catch(
    (error) => error,
  );
  await waitForMatrixChildren(f.jobs.slice(0, 2));
  writeFileSync(join(f.jobs[0].options.output, 'fail-now'), 'go');
  assert.match((await pending).message, /job-0.*Fixture child stopped/);
  assert.deepEqual(
    f.jobs.map((job) => job.record.status),
    ['failed', 'interrupted', 'pending', 'pending'],
  );
  for (const job of f.jobs.slice(0, 2)) {
    assert.throws(() => process.kill(job.record.pid, 0));
    const pid = Number(readFileSync(join(job.options.output, 'child.pid'), 'utf8'));
    assert.throws(() => process.kill(pid, 0));
  }
  assert.ok(f.jobs.slice(2).every((job) => !existsSync(job.options.output)));
});

test('Ctrl+C cancels every concurrent review process and keeps queued jobs pending', async (t) => {
  const f = matrixFixture(t, 3);
  f.jobs.forEach((job) => {
    job.options.input.mode = 'hold';
  });
  const pool = new URL('../scripts/review/matrix-pool.mjs', import.meta.url).href;
  const statusPath = join(f.root, 'status.json');
  const script = `
    import {runMatrixJobs} from ${JSON.stringify(pool)};
    import {writeFileSync} from 'node:fs';
    const jobs = ${JSON.stringify(f.jobs)};
    try {
      await runMatrixJobs(jobs, {workerPath:${JSON.stringify(f.workerPath)}, concurrency:2});
    } catch (error) {
      writeFileSync(${JSON.stringify(statusPath)}, JSON.stringify({signal:error.interruptedBy,jobs}));
      process.exitCode=error.exitCode;
    }
  `;
  const supervisor = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: 'ignore',
  });
  t.after(() => {
    try {
      supervisor.kill('SIGKILL');
    } catch {
      /* Exited. */
    }
  });
  const finished = new Promise((resolve, reject) => {
    supervisor.once('error', reject);
    supervisor.once('close', resolve);
  });
  await waitForMatrixChildren(f.jobs.slice(0, 2));
  supervisor.kill('SIGINT');
  assert.equal(await finished, 130);
  const status = readJson(statusPath);
  assert.equal(status.signal, 'SIGINT');
  assert.deepEqual(
    status.jobs.map((job) => job.record.status),
    ['interrupted', 'interrupted', 'pending'],
  );
  for (const job of status.jobs.slice(0, 2)) {
    assert.throws(() => process.kill(job.record.pid, 0));
    assert.throws(() =>
      process.kill(Number(readFileSync(join(job.options.output, 'child.pid'), 'utf8')), 0),
    );
  }
});

test('matrix startup failures are recorded and concurrency must be bounded', async (t) => {
  const f = matrixFixture(t, 2);
  for (const value of [0, -1, 10, 'two', 1.2]) assert.throws(() => matrixConcurrency(value));
  assert.equal(matrixConcurrency(), 3);
  assert.equal(matrixConcurrency('1'), 1);
  await assert.rejects(
    runMatrixJobs(f.jobs, { workerPath: join(f.root, 'missing.mjs'), concurrency: 1 }),
    /job-0/,
  );
  assert.deepEqual(
    f.jobs.map((job) => job.record.status),
    ['failed', 'pending'],
  );
});

test('an aborted worker cannot start a later review or preflight command', async (t) => {
  const options = processOptions(t);
  const controller = new AbortController();
  controller.abort('SIGINT');
  const marker = join(options.cwd, 'must-not-run');
  const result = await executeProcess(
    process.execPath,
    ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
    {
      ...options,
      signal: controller.signal,
    },
  );
  assert.equal(result.interruptedBy, 'SIGINT');
  assert.equal(existsSync(marker), false);
});

test('matrix dispatches all nine jobs using the frozen runner and records their settings', (t) => {
  const f = fixture(t);
  const scripts = join(f.checkout, 'scripts/review');
  cpSync(new URL('../scripts/review', import.meta.url), scripts, { recursive: true });
  cpSync(contractDir, join(f.checkout, 'docs/review'), { recursive: true });
  mkdirSync(join(f.checkout, 'node_modules'));
  symlinkSync(
    new URL('../node_modules/ajv', import.meta.url).pathname,
    join(f.checkout, 'node_modules/ajv'),
  );
  saveJson(join(f.checkout, 'package-lock.json'), { lockfileVersion: 3 });
  for (const name of ['filters', 'edit', 'get'])
    saveJson(join(f.checkout, 'docs/review/examples', `${name}.json`), f.input);
  // Replace only the fixture runner. No review CLI or sandbox is called by this test.
  writeFileSync(
    join(scripts, 'run.mjs'),
    `
    import {mkdirSync, writeFileSync} from 'node:fs';
    import {join} from 'node:path';
    export async function runReview(options) {
      mkdirSync(options.output);
      writeFileSync(join(options.output, 'fixture.json'), JSON.stringify({
        module:import.meta.url, pid:process.pid, input:options.input, variant:options.variant,
        model:process.env.WORKSHOP_REVIEW_MODEL, effort:process.env.WORKSHOP_REVIEW_EFFORT,
        timeout:process.env.WORKSHOP_REVIEW_TIMEOUT_SECONDS,
      }));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  `,
  );
  const out = join(f.checkout, '.review-runs/parallel-fixture');
  const execution = spawnSync(process.execPath, [join(scripts, 'matrix.mjs'), 'run', out], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      WORKSHOP_REVIEW_CONCURRENCY: '3',
      WORKSHOP_REVIEW_MODEL: 'fixture-model',
      WORKSHOP_REVIEW_EFFORT: 'medium',
      WORKSHOP_REVIEW_TIMEOUT_SECONDS: '25',
    },
  });
  assert.equal(execution.status, 0, execution.stderr);
  const manifest = readJson(join(out, 'matrix.json'));
  assert.equal(manifest.status, 'completed');
  assert.equal(manifest.concurrency, 3);
  assert.equal(manifest.timeoutSeconds, 25);
  assert.equal(manifest.runs.length, 9);
  assert.equal(new Set(manifest.runs.map((record) => record.pid)).size, 9);
  let overlap = 0;
  const events = [];
  for (const record of manifest.runs) {
    assert.equal(record.status, 'completed');
    const result = readJson(join(record.directory, 'fixture.json'));
    assert.match(result.module, /harness\/scripts\/review\/run.mjs$/);
    assert.equal(result.pid, record.pid);
    assert.equal(result.variant, record.variant);
    assert.equal(result.model, 'fixture-model');
    assert.equal(result.effort, 'medium');
    assert.equal(result.timeout, '25');
    assert.deepEqual(result.input, readJson(join(out, 'inputs', `${record.case}.json`)));
    events.push([record.startedAt, 1], [record.finishedAt, -1]);
  }
  const depths = events
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1])
    .map(([, delta]) => (overlap += delta));
  assert.equal(Math.max(...depths), 3);
  for (const [path, digest] of Object.entries(manifest.harnessFiles))
    assert.equal(fileHash(join(out, 'harness', path)), digest);
});
