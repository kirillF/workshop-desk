import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
export const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const contractDir = resolve(project, 'docs/review');
export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const fileHash = (path) => hash(readFileSync(path));
export const saveJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
export function newDirectory(path) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  mkdirSync(target); // Never overwrite an existing run, including a failed run.
  return realpathSync(target);
}
export function command(cwd, executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${executable} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return options.raw ? result.stdout : result.stdout.trim();
}
export const git = (cwd, ...args) => command(cwd, 'git', args);
export function localPath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.includes('\\') &&
    !path.split('/').some((part) => !part || part === '.' || part === '..')
  );
}
export function validateShape(value, schema) {
  const ajv = new Ajv({ allErrors: true });
  const valid = ajv.compile(schema);
  return valid(value) ? [] : [ajv.errorsText(valid.errors)];
}
export function validateInput(input, variant) {
  if (!['A', 'B', 'C'].includes(variant)) throw new Error('Variant must be A, B or C.');
  const schema = readJson(resolve(contractDir, 'input.schema.json'));
  if (variant === 'A') {
    schema.required = schema.required.filter((key) => key !== 'prDescription');
    schema.properties.prDescription = { type: 'string' };
  }
  const errors = validateShape(input, schema);
  if (!errors.length && input.contextDocuments.some((path) => !localPath(path)))
    errors.push('Context paths must stay inside the repository.');
  if (errors.length) throw new Error(errors.join('\n'));
}
export function resolveScope(checkout, input) {
  const requestedBase = git(
    checkout,
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${input.scope.base}^{commit}`,
  );
  const head = git(
    checkout,
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${input.scope.head}^{commit}`,
  );
  const base =
    input.scope.comparison === 'merge_base'
      ? git(checkout, 'merge-base', requestedBase, head)
      : requestedBase;
  return { requested: input.scope, requestedBase, base, head };
}
export function compose(variant, input) {
  const read = (name) => readFileSync(resolve(contractDir, name), 'utf8').trim();
  const blocks = [read('review.md')];
  if (variant !== 'A') blocks.push(read('B-pr-context.md'));
  blocks.push(composeContext(variant, input).trimEnd());
  return `${blocks.join('\n\n')}\n`;
}

// Context is shared; discovery must not inherit final-publication filtering.
export function composeContext(variant, input) {
  validateInput(input, variant);
  const blocks = [];
  const comparison =
    input.scope.comparison === 'merge_base'
      ? 'Compare head with the common ancestor of base and head.'
      : 'Compare the base and head trees directly.';
  blocks.push(
    `## Review scope\n\nBase: ${input.scope.base}\nHead: ${input.scope.head}\nComparison: ${comparison}`,
  );
  if (variant !== 'A') blocks.push(`## PR description\n\n${input.prDescription}`);
  if (input.contextDocuments.length)
    blocks.push(
      `## Context documents\n\n${input.contextDocuments.map((path) => `- ${path}`).join('\n')}`,
    );
  if (input.reportedChecks.length)
    blocks.push(
      `## Supplied checks (not your executions)\n\n${input.reportedChecks
        .map(
          (check) => `Command: ${check.command}\nResult: ${check.result}\nSource: ${check.source}`,
        )
        .join('\n\n')}`,
    );
  blocks.push(
    '## Execution boundary\n\nReview only the supplied committed scope. Read applicable root and scoped AGENTS.md files in this checkout; automatic global instruction loading is disabled. Do not use prior reviews or other checkouts. Source files are read-only; use .review-tmp for temporary reproductions. Use the comparison specified above. The runner resolves any merge base before execution. Use the supplied output schema when present; otherwise return a concise plain-text report.',
  );
  return `${blocks.join('\n\n')}\n`;
}

export function blob(checkout, revision, path) {
  if (!localPath(path)) throw new Error('Invalid repository path.');
  const mode = git(checkout, 'ls-tree', revision, '--', path).split(/\s/)[0];
  if (!['100644', '100755'].includes(mode))
    throw new Error('Source must be a regular tracked file.');
  return command(checkout, 'git', ['show', `${revision}:${path}`], {
    raw: true,
  });
}
export function diffLocations(checkout, base, head) {
  const locations = [];
  const entries = git(checkout, 'diff', '--no-renames', '--name-status', '-z', base, head)
    .split('\0')
    .filter(Boolean);
  for (let i = 0; i < entries.length; i += 2) {
    const status = entries[i],
      path = entries[i + 1];
    const diff = git(
      checkout,
      'diff',
      '--no-ext-diff',
      '--no-renames',
      '--unified=0',
      base,
      head,
      '--',
      path,
    );
    for (const match of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      for (const [revision, start, count] of [
        ['base', Number(match[1]), Number(match[2] ?? 1)],
        ['head', Number(match[3]), Number(match[4] ?? 1)],
      ]) {
        if (count > 0)
          locations.push({
            path,
            revision,
            start,
            end: start + count - 1,
            status,
          });
      }
    }
  }
  return locations;
}
// Decode the display wrapper as shell words without evaluating its contents.
// A single argument can concatenate single-quoted, double-quoted and escaped parts.
function shellWords(text) {
  const words = [];
  let word = '',
    quote = null,
    started = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
    } else if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '\\' && i + 1 < text.length && '$`"\\\n'.includes(text[i + 1])) {
        const next = text[++i];
        if (next !== '\n') word += next;
      } else word += char;
    } else if (/\s/.test(char)) {
      if (started) {
        words.push(word);
        word = '';
        started = false;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === '\\') {
      if (++i === text.length) return null;
      if (text[i] !== '\n') {
        word += text[i];
        started = true;
      }
    } else {
      // Accept only the wrapper's literal argument vector, not a compound shell program.
      if (';&|<>()'.includes(char)) return null;
      word += char;
      started = true;
    }
  }
  if (quote) return null;
  if (started) words.push(word);
  return words;
}

export function commandBody(text) {
  const original = text.trim();
  const words = shellWords(original);
  if (
    words?.length === 3 &&
    /^(?:\S*\/)?(?:bash|zsh|sh)$/.test(words[0]) &&
    /^-[a-z]*c$/.test(words[1])
  )
    return words[2];
  return original;
}
export function traceCommands(text) {
  const commands = [];
  for (const line of text.split('\n').filter((line) => line.trim())) {
    const event = JSON.parse(line);
    if (event.type === 'item.completed' && event.item?.type === 'command_execution')
      commands.push(event.item);
  }
  return commands;
}
export function validateReport(result, { checkout, scope, input, schema, trace }) {
  const errors = validateShape(result, schema);
  if (errors.length) return { errors, matchedChecks: [] };
  let events;
  try {
    events = traceCommands(trace);
  } catch {
    return { errors: ['Invalid JSONL trace.'], matchedChecks: [] };
  }
  // Historical runs keep their captured schema and strict source/check validation.
  const compact = Object.hasOwn(schema.properties.findings.items.properties, 'body');
  const matchedChecks = [],
    checks = new Map(),
    ids = new Set();
  for (const check of result.checks || []) {
    if (checks.has(check.id)) errors.push(`Duplicate check ID: ${check.id}`);
    checks.set(check.id, check);
    const matches = events.filter(
      (event) =>
        commandBody(event.command || '') === commandBody(check.command) &&
        Number.isInteger(event.exit_code) &&
        typeof event.aggregated_output === 'string' &&
        event.aggregated_output.includes(check.outputExcerpt) &&
        (check.outcome === 'passed' ? event.exit_code === 0 : event.exit_code !== 0),
    );
    if (matches.length !== 1)
      errors.push(
        `${check.id}: requires one matching completed tool event with the stated command, exit outcome and output excerpt.`,
      );
    else
      matchedChecks.push({
        checkId: check.id,
        traceItemId: matches[0].id,
        exit: matches[0].exit_code,
        outputSha256: hash(matches[0].aggregated_output),
      });
  }
  const locations = diffLocations(checkout, scope.base, scope.head);
  const normalized = (text) => text.replace(/\s+/g, ' ').trim();
  function source(source, label) {
    if (source.kind === 'pr_description') {
      if (
        source.path !== '' ||
        source.revision !== 'input' ||
        source.startLine !== 0 ||
        source.endLine !== 0 ||
        !normalized(source.quote) ||
        !normalized(input.prDescription || '').includes(normalized(source.quote))
      )
        errors.push(`${label}: invalid PR-description source.`);
      return;
    }
    try {
      if (!['base', 'head'].includes(source.revision)) throw new Error('invalid revision');
      const lines = blob(checkout, scope[source.revision], source.path).split('\n');
      if (
        source.startLine < 1 ||
        source.endLine < source.startLine ||
        source.endLine > lines.length
      )
        throw new Error('invalid source range');
      const quoted = lines.slice(source.startLine - 1, source.endLine).join('\n');
      if (!normalized(source.quote) || !normalized(quoted).includes(normalized(source.quote)))
        throw new Error('quote is absent from source');
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  for (const finding of result.findings) {
    if (ids.has(finding.id)) errors.push(`Duplicate finding ID: ${finding.id}`);
    ids.add(finding.id);
    const location = finding.location;
    if (
      !locations.some(
        (range) =>
          range.path === location.path &&
          range.revision === location.revision &&
          location.startLine <= range.end &&
          location.endLine >= range.start,
      ) ||
      location.endLine < location.startLine
    )
      errors.push(`${finding.id}: location does not overlap the recorded diff.`);
    try {
      const length = blob(checkout, scope[location.revision], location.path).split('\n').length;
      if (location.startLine < 1 || location.endLine > length)
        errors.push(`${finding.id}: location is outside file bounds.`);
    } catch (error) {
      errors.push(`${finding.id}: ${error.message}`);
    }
    if (compact) continue;
    finding.sources.forEach((item) => source(item, finding.id));
    const linked = finding.evidence.checkIds;
    if (finding.evidence.method === 'code_trace' && linked.length)
      errors.push(`${finding.id}: code_trace must not claim executed checks.`);
    if (finding.evidence.method === 'executed_check' && !linked.length)
      errors.push(`${finding.id}: missing executed check.`);
    for (const id of linked) {
      if (
        !checks.has(id) ||
        checks.get(id).outcome === 'blocked' ||
        !matchedChecks.some((match) => match.checkId === id)
      )
        errors.push(`${finding.id}: unverified or blocked execution reference ${id}.`);
    }
  }
  if (!compact)
    result.requirementsQuestions.forEach((question) =>
      question.sources.forEach((item) => source(item, 'requirements question')),
    );
  return {
    errors,
    matchedChecks,
    interpretationRequiresEngineer: true,
    ...(compact ? { executionEvidence: 'trace.jsonl' } : {}),
  };
}
