import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateSuite,
  schedule,
  scoreObservations,
  validateFrozen,
} from '../scripts/review/eval.mjs';
import { fileHash, saveJson } from '../scripts/review/core.mjs';

function fixture() {
  const input = {
    scope: { base: 'main', head: 'feature', comparison: 'direct' },
    prDescription: 'Add a feature.',
    contextDocuments: [],
    reportedChecks: [],
  };
  const suite = {
    version: 1,
    id: 'pilot',
    source: '.',
    variants: ['B', 'C'],
    repeats: 2,
    calibrationFamilies: ['edit', 'get', 'filters'],
    cases: ['p1', 'p2'].map((id) => ({
      id,
      family: 'new-family',
      exposure: 'heldout',
      input: structuredClone(input),
    })),
  };
  const oracle = {
    version: 1,
    suiteId: 'pilot',
    cases: [
      {
        caseId: 'p1',
        kind: 'defect',
        defects: [{ id: 'd1', description: 'A reachable defect', evidence: 'Red/green oracle' }],
      },
      { caseId: 'p2', kind: 'control', defects: [] },
    ],
  };
  return { suite, oracle };
}

test('held-out planning rejects calibration families, missing controls and unequal paired context', () => {
  const { suite, oracle } = fixture();
  assert.doesNotThrow(() => validateSuite(suite, oracle));
  suite.cases[0].family = 'edit';
  assert.throws(() => validateSuite(suite, oracle), /held-out/);
  suite.cases[0].family = 'new-family';
  suite.cases[1].input.prDescription = 'A hint available only to one version';
  assert.throws(() => validateSuite(suite, oracle), /paired inputs/);
  suite.cases.pop();
  oracle.cases.pop();
  assert.throws(() => validateSuite(suite, oracle), /correct control/);
});

test('scheduling includes every fixed repeat and counterbalances variant order', () => {
  const { suite } = fixture();
  const jobs = schedule(suite);
  assert.equal(jobs.length, 8);
  assert.equal(new Set(jobs.map((j) => j.id)).size, 8);
  assert.deepEqual(
    jobs.slice(0, 4).map((j) => j.variant),
    ['B', 'C', 'C', 'B'],
  );
  assert.deepEqual(
    jobs.slice(4, 8).map((j) => j.variant),
    ['C', 'B', 'B', 'C'],
  );
});

function evidence() {
  const { suite, oracle } = fixture();
  suite.repeats = 1;
  const observations = [
    {
      id: 'p1-C-01',
      caseId: 'p1',
      variant: 'C',
      valid: true,
      runDigest: 'c1',
      text: '[]',
      findings: [],
      candidates: [{ id: 'semantics:issue' }],
      usage: null,
      durationMs: 100,
    },
    {
      id: 'p2-C-01',
      caseId: 'p2',
      variant: 'C',
      valid: true,
      runDigest: 'c2',
      text: 'A speculative concern',
      findings: [{ id: 'F1', body: 'A speculative concern' }],
      candidates: [],
      usage: { input_tokens: 1000, cached_input_tokens: 900, output_tokens: 100 },
      durationMs: 200,
    },
    {
      id: 'p1-B-01',
      caseId: 'p1',
      variant: 'B',
      valid: false,
      errors: ['Sandbox failed'],
      durationMs: 20,
      usage: null,
    },
    {
      id: 'p2-B-01',
      caseId: 'p2',
      variant: 'B',
      valid: true,
      runDigest: 'b2',
      text: 'No issues',
      findings: null,
    },
  ];
  const adjudication = {
    version: 1,
    reviewedBy: 'Engineer',
    records: [
      {
        runId: 'p1-C-01',
        runDigest: 'c1',
        commentsComplete: true,
        comments: [],
        defects: [
          {
            id: 'd1',
            candidateIds: ['semantics:issue'],
            inspectionComplete: true,
            evidence: 'The candidate describes the oracle scenario; final report drops it.',
          },
        ],
      },
      {
        runId: 'p2-C-01',
        runDigest: 'c2',
        commentsComplete: true,
        comments: [
          {
            id: 'F1',
            quote: 'A speculative concern',
            verdict: 'false_positive',
            defectIds: [],
            evidence: 'The cited behavior is the explicit accepted change.',
          },
        ],
        defects: [],
      },
    ],
  };
  return { suite, oracle, observations, adjudication };
}

test('scoring separates verifier loss, control noise, invalid runs, missing judgments and unknown cost', () => {
  const { suite, oracle, observations, adjudication } = evidence();
  const { scores } = scoreObservations(suite, oracle, observations, adjudication);
  assert.equal(scores.C.discoveredButNotReported, 1);
  assert.equal(scores.C.knownDefectRecall, 0);
  assert.equal(scores.C.controlsWithFalsePositives, 1);
  assert.equal(scores.C.precision, 0);
  assert.equal(scores.C.usageMissing, 1);
  assert.equal(scores.B.invalid, 1);
  assert.equal(scores.B.unadjudicated, 1);
  assert.equal(scores.B.knownDefectRecall, null);
  assert.equal(scores.B.evaluationComplete, false);
});

test('stale or incomplete adjudication fails rather than silently improving metrics', () => {
  const { suite, oracle, observations, adjudication } = evidence();
  adjudication.records[0].runDigest = 'old';
  assert.throws(() => scoreObservations(suite, oracle, observations, adjudication), /stale/);
  adjudication.records[0].runDigest = 'c1';
  adjudication.records[0].commentsComplete = false;
  assert.throws(() => scoreObservations(suite, oracle, observations, adjudication), /inventory/);
  adjudication.records[0].commentsComplete = true;
  adjudication.records[1].comments = [];
  assert.throws(() => scoreObservations(suite, oracle, observations, adjudication), /inventory/);
});

test('unknown candidate IDs, unknown defects and invented report quotes are rejected', () => {
  const { suite, oracle, observations, adjudication } = evidence();
  adjudication.records[0].defects[0].candidateIds = ['invented'];
  assert.throws(
    () => scoreObservations(suite, oracle, observations, adjudication),
    /Unknown discovery/,
  );
  adjudication.records[0].defects[0].candidateIds = [];
  adjudication.records[1].comments[0].quote = 'Invented';
  assert.throws(
    () => scoreObservations(suite, oracle, observations, adjudication),
    /exact report quote/,
  );
  adjudication.records[1].comments[0].quote = 'A speculative concern';
  adjudication.records[1].comments[0].defectIds = ['wrong'];
  assert.throws(
    () => scoreObservations(suite, oracle, observations, adjudication),
    /oracle defect/,
  );
});

test('additional real defects on a control are not mislabeled false positives', () => {
  const { suite, oracle, observations, adjudication } = evidence();
  adjudication.records[1].comments[0].verdict = 'confirmed';
  adjudication.records[1].comments[0].evidence =
    'A separate reachable defect confirmed by a probe.';
  const { scores } = scoreObservations(suite, oracle, observations, adjudication);
  assert.equal(scores.C.falsePositive, 0);
  assert.equal(scores.C.additionalConfirmedComments, 1);
  assert.equal(scores.C.controlsWithAdditionalDefects, 1);
  assert.equal(scores.C.knownDetected, 0);
});

test('multiline C evidence is matched against the actual finding, not escaped JSON or another finding', () => {
  const { suite, oracle, observations, adjudication } = evidence();
  observations[1].findings[0].body = 'Line one\nLine two';
  observations[1].text = JSON.stringify(observations[1].findings);
  adjudication.records[1].comments[0].quote = 'Line one\nLine two';
  assert.doesNotThrow(() => scoreObservations(suite, oracle, observations, adjudication));
});

test('two comments describing one known defect do not inflate recall', () => {
  const { suite, oracle, observations, adjudication } = evidence();
  observations[0].findings = [
    { id: 'F1', body: 'One' },
    { id: 'F2', body: 'Two' },
  ];
  observations[0].text = 'One Two';
  adjudication.records[0].comments = observations[0].findings.map((f) => ({
    id: f.id,
    quote: f.body,
    verdict: 'confirmed',
    defectIds: ['d1'],
    evidence: 'Verified same defect.',
  }));
  const { scores } = scoreObservations(suite, oracle, observations, adjudication);
  assert.equal(scores.C.knownDetected, 1);
  assert.equal(scores.C.knownOpportunities, 1);
});

test('editing a frozen input, oracle or instruction breaks the seal checks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'heldout-seal-'));
  try {
    mkdirSync(join(dir, 'inputs'));
    mkdirSync(join(dir, 'harness'));
    saveJson(join(dir, 'oracle.json'), {});
    saveJson(join(dir, 'inputs/p1.json'), {});
    writeFileSync(join(dir, 'harness/prompt.md'), 'Frozen instruction');
    const manifest = {
      oracleDigest: fileHash(join(dir, 'oracle.json')),
      inputs: { p1: fileHash(join(dir, 'inputs/p1.json')) },
      harnessFiles: { 'prompt.md': fileHash(join(dir, 'harness/prompt.md')) },
    };
    saveJson(join(dir, 'manifest.json'), manifest);
    saveJson(join(dir, 'seal.json'), { manifestDigest: fileHash(join(dir, 'manifest.json')) });
    assert.doesNotThrow(() => validateFrozen(dir));
    for (const file of ['inputs/p1.json', 'oracle.json', 'harness/prompt.md', 'manifest.json']) {
      const old =
        file === 'harness/prompt.md'
          ? 'Frozen instruction'
          : file === 'manifest.json'
            ? `${JSON.stringify(manifest, null, 2)}\n`
            : '{}\n';
      writeFileSync(join(dir, file), 'Changed');
      assert.throws(() => validateFrozen(dir));
      writeFileSync(join(dir, file), old);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
