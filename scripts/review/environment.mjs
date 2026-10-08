import {
  cpSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  readdirSync,
  lstatSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { executeProcess } from './process.mjs';
import { command, git, saveJson, hash, localPath } from './core.mjs';

export const runtimePath = [
  '/opt/homebrew/bin',
  '/Applications/Xcode.app/Contents/Developer/usr/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]
  .filter(existsSync)
  .join(':');

export function shellCommand(executable, args) {
  return [executable, ...args].map((part) => "'" + part.replaceAll("'", "'\\''") + "'").join(' ');
}

export function resetWritable(checkout, writable) {
  for (const path of writable) {
    if (!localPath(path) || git(checkout, 'ls-files', '--', path))
      throw new Error(`Unsafe writable reset: ${path}`);
    rmSync(join(checkout, path), { recursive: true, force: true });
    mkdirSync(join(checkout, path), { recursive: true });
  }
}

export function snapshot(source, scope, runDir, dependencyRoot = source) {
  const checkout = join(runDir, 'checkout');
  mkdirSync(checkout);
  git(checkout, 'init', '--quiet');
  // Fetch only the selected two snapshots. No shared object store, remote or fix refs.
  git(
    checkout,
    '-c',
    'protocol.file.allow=always',
    'fetch',
    '--quiet',
    '--no-tags',
    '--depth=1',
    source,
    scope.base,
    scope.head,
  );
  git(checkout, 'update-ref', 'refs/heads/review-base', scope.base);
  git(checkout, 'checkout', '--quiet', '--detach', scope.head);
  const deps = realpathSync(join(dependencyRoot, 'node_modules'));
  cpSync(deps, join(checkout, 'node_modules'), { recursive: true, verbatimSymlinks: true });
  const pkg = JSON.parse(readFileSync(join(checkout, 'package.json'), 'utf8'));
  for (const workspace of pkg.workspaces || []) {
    const manifest = join(checkout, workspace, 'package.json');
    if (!existsSync(manifest)) throw new Error(`Unsupported/missing workspace ${workspace}`);
    const name = JSON.parse(readFileSync(manifest, 'utf8')).name;
    const link = join(checkout, 'node_modules', name);
    rmSync(link, { recursive: true, force: true });
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(relative(dirname(link), dirname(manifest)), link);
  }
  function checkLinks(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name),
        stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const rel = relative(checkout, realpathSync(path));
        if (rel.startsWith('..')) throw new Error(`Dependency link leaves snapshot: ${path}`);
      } else if (stat.isDirectory()) checkLinks(path);
    }
  }
  checkLinks(join(checkout, 'node_modules'));
  const writable = [
    '.review-tmp',
    'node_modules/.vite-temp',
    'node_modules/.vite',
    'node_modules/.vitest',
    'coverage',
    'dist',
    'test-results',
  ];
  for (const path of writable) {
    if (git(checkout, 'ls-files', '--', path))
      throw new Error(`Writable scratch overlaps tracked source: ${path}`);
    const target = join(checkout, path);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
  }
  // The scratch area must not alter git status; it never appears in the reviewed diff.
  writeFileSync(join(checkout, '.git/info/exclude'), '\n.review-tmp/\n');
  return { checkout, writable };
}
function toml(value) {
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}=${toml(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function configuration(checkout, writable) {
  const scratch = join(checkout, '.review-tmp');
  const filesystem = {
    ':root': 'deny',
    ':minimal': 'read',
    ':slash_tmp': 'deny',
    ':workspace_roots': { '.': 'read' },
  };
  // Homebrew tools live outside the platform's minimal runtime roots.
  if (existsSync('/opt/homebrew')) filesystem['/opt/homebrew'] = 'read';
  filesystem[checkout] = 'read';
  for (const path of writable) filesystem[join(checkout, path)] = 'write';
  const profile = { extends: ':read-only', filesystem, network: { enabled: false } };
  const settings = {
    default_permissions: 'workshop_review',
    permissions: { workshop_review: profile },
    approval_policy: 'never',
    web_search: 'disabled',
    project_doc_max_bytes: 0,
    allow_login_shell: false,
    shell_environment_policy: {
      inherit: 'core',
      set: {
        PATH: runtimePath,
        TMPDIR: scratch,
        npm_config_cache: join(scratch, 'npm-cache'),
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        XDG_CONFIG_HOME: join(scratch, 'config'),
      },
    },
    projects: { [checkout]: { trust_level: 'untrusted' } },
  };
  return {
    settings,
    args: Object.entries(settings).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`]),
  };
}
export async function sandboxRun(
  checkout,
  config,
  executable,
  args,
  stdoutPath,
  stderrPath,
  timeout = 180000,
  signal,
) {
  const result = await executeProcess(
    'codex',
    ['sandbox', '-P', 'workshop_review', ...config.args, '-C', checkout, executable, ...args],
    {
      cwd: checkout,
      env: { ...process.env, ...config.settings.shell_environment_policy.set },
      stdoutPath,
      stderrPath,
      timeoutMs: timeout,
      signal,
    },
  );
  return {
    ...result,
    stdout: readFileSync(stdoutPath, 'utf8'),
    stderr: readFileSync(stderrPath, 'utf8'),
  };
}
export async function preflight(checkout, config, source, runDir, signal) {
  const sentinel = join(runDir, 'outside-checkout.txt');
  writeFileSync(sentinel, 'Must not be readable by reviewer commands.');
  const probe = `
    const fs=require('node:fs');
    fs.readFileSync('package.json');
    fs.writeFileSync('.review-tmp/write-probe','ok');
    for(const file of ${JSON.stringify([sentinel, join(source, 'AGENTS.md')])}) {
      let denied=false; try { fs.readFileSync(file); } catch { denied=true; }
      if(!denied)throw Error('Outside read was allowed: '+file);
    }
    let denied=false;try { const fd=fs.openSync('package.json','r+'); fs.closeSync(fd); }catch{denied=true;}
    if(!denied)throw Error('Tracked source is writable');
    console.log('Read isolation, source protection and scratch writes verified.');`;
  const runtimeProbe = `
    const fs=require('node:fs'),assert=require('node:assert/strict');
    const {execFileSync}=require('node:child_process');
    assert.equal(fs.realpathSync(process.execPath),${JSON.stringify(realpathSync(process.execPath))},'Reviewer shell selected a different Node executable');
    assert.equal(process.version,${JSON.stringify(process.version)},'Reviewer shell selected a different Node version');
    const npm=execFileSync('npm',['--version'],{encoding:'utf8'}).trim();
    assert.match(npm,/^11\\./,'Reviewer shell selected an incompatible npm');
    execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'});
    execFileSync('git',['diff','--stat','review-base','HEAD'],{encoding:'utf8'});
    console.log(JSON.stringify({node:process.version,executable:process.execPath,npm,git:'readable'}));`;
  const records = [];
  const jobs = [
    ['isolation', 'node', ['-e', probe]],
    ['runtime', 'node', ['-e', runtimeProbe]],
    ['project_check', 'npm', ['run', 'check']],
    ['project_check', 'npm', ['run', 'test:unit']],
    ['project_check', 'npm', ['run', 'test:components']],
  ];
  for (const [index, [kind, executable, args]] of jobs.entries()) {
    // Match the non-login shell used by reviewer tools; direct launches can hide PATH drift.
    const shellArgs = ['-c', shellCommand(executable, args)];
    const log = `preflight-${index}.log`;
    const result = await sandboxRun(
      checkout,
      config,
      '/bin/zsh',
      shellArgs,
      join(runDir, `preflight-${index}.stdout.log`),
      join(runDir, `preflight-${index}.stderr.log`),
      undefined,
      signal,
    );
    const output = (result.stdout || '') + (result.stderr || '');
    writeFileSync(join(runDir, log), output);
    records.push({
      kind,
      command: [executable, ...args],
      executor: ['/bin/zsh', ...shellArgs],
      exit: result.status,
      error: result.error?.message || null,
      timedOut: result.timedOut,
      interruptedBy: result.interruptedBy,
      log,
      outputSha256: hash(output),
    });
    saveJson(join(runDir, 'preflight.json'), records);
    if (result.status !== 0 || result.error || result.timedOut || result.interruptedBy) {
      const error = new Error(
        `Preflight ${result.interruptedBy ? 'interrupted' : result.timedOut ? 'timed out' : 'failed'}; inspect ${join(runDir, log)}`,
      );
      error.exitCode = result.interruptedBy === 'SIGINT' ? 130 : result.interruptedBy ? 143 : 1;
      error.interruptedBy = result.interruptedBy;
      throw error;
    }
  }
  if (git(checkout, 'status', '--porcelain', '--untracked-files=no'))
    throw new Error('Preflight changed tracked source.');
  return records;
}
export function sourceFingerprint(checkout) {
  const paths = git(checkout, 'ls-files', '-z').split('\0').filter(Boolean);
  return hash(
    paths.map((path) => `${path}\0${hash(readFileSync(resolve(checkout, path)))}`).join('\0'),
  );
}
export const codexVersion = () => command(process.cwd(), 'codex', ['--version']);
