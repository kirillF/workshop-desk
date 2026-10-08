import { spawn } from 'node:child_process';
import { openSync, closeSync, writeSync } from 'node:fs';

// Own the whole child process group so interruption cannot leave a review or test running.
export async function executeProcess(
  executable,
  args,
  {
    cwd,
    env = process.env,
    input = '',
    stdoutPath,
    stderrPath,
    timeoutMs,
    graceMs = 5000,
    signal: abortSignal,
  },
) {
  const stdout = openSync(stdoutPath, 'wx');
  let stderr;
  let child;
  try {
    stderr = openSync(stderrPath, 'wx');
    if (abortSignal?.aborted) {
      closeSync(stdout);
      closeSync(stderr);
      return {
        status: null,
        signal: null,
        error: null,
        timedOut: false,
        interruptedBy: abortSignal.reason || 'SIGTERM',
      };
    }
    child = spawn(executable, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
  } catch (error) {
    closeSync(stdout);
    if (stderr !== undefined) closeSync(stderr);
    throw error;
  }
  return new Promise((resolve) => {
    let done = false;
    let forcedStop;
    let timedOut = false;
    let interruptedBy = null;
    let outputError = null;
    const kill = (signal) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        /* The owned process group has already exited. */
      }
    };
    const stop = () => {
      kill('SIGTERM');
      forcedStop ??= setTimeout(() => kill('SIGKILL'), graceMs);
    };
    const interrupt = (signal) => {
      interruptedBy ||= signal;
      stop();
    };
    const onInterrupt = () => interrupt('SIGINT');
    const onTerminate = () => interrupt('SIGTERM');
    const onAbort = () => interrupt(abortSignal.reason || 'SIGTERM');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const finish = (status, signal, error = null) => {
      if (done) return;
      done = true;
      // Descendants can outlive the CLI even after its own close event.
      kill('SIGKILL');
      clearTimeout(timeout);
      clearTimeout(forcedStop);
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
      abortSignal?.removeEventListener('abort', onAbort);
      closeSync(stdout);
      closeSync(stderr);
      resolve({ status, signal, error: error || outputError, timedOut, interruptedBy });
    };
    // Pipes keep sandboxed tools from inspecting log-file descriptors outside their boundary.
    const save = (fd) => (chunk) => {
      try {
        writeSync(fd, chunk);
      } catch (error) {
        outputError ||= error;
        stop();
      }
    };
    child.stdout.on('data', save(stdout));
    child.stderr.on('data', save(stderr));
    child.once('exit', () => kill('SIGKILL'));
    child.once('close', (status, signal) => finish(status, signal));
    child.once('error', (error) => finish(null, null, error));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
