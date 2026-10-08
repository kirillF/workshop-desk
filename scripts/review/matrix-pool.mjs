import { fork } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';

export function matrixConcurrency(value = '3') {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 9)
    throw new Error('WORKSHOP_REVIEW_CONCURRENCY must be an integer between 1 and 9.');
  return count;
}

// Separate Node processes isolate module state and signal handlers as well as checkouts.
export async function runMatrixJobs(
  jobs,
  { workerPath, concurrency = 3, env = process.env, beforeStart = () => {}, onChange = () => {} },
) {
  matrixConcurrency(concurrency);
  const environment = { ...env };
  const active = new Map();
  let next = 0;
  let failure;
  let stopSignal;
  let resolveFinished;
  const finished = new Promise((resolve) => {
    resolveFinished = resolve;
  });
  const send = (child, message) => {
    if (child.connected) child.send(message, () => {});
  };
  const stop = (error, signal = 'SIGTERM') => {
    failure ||= error;
    stopSignal ||= signal;
    for (const { child } of active.values()) send(child, { type: 'cancel', signal: stopSignal });
  };
  const update = (record) => {
    try {
      onChange(record);
    } catch (error) {
      stop(error);
    }
  };
  const interrupt = (signal) => {
    const error = new Error(`Matrix interrupted by ${signal}.`);
    error.interruptedBy = signal;
    error.exitCode = signal === 'SIGINT' ? 130 : 143;
    stop(error, signal);
    if (!active.size) resolveFinished();
  };
  const onInterrupt = () => interrupt('SIGINT');
  const onTerminate = () => interrupt('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  const launch = (job) => {
    const record = job.record;
    let child;
    let stdout;
    let stderr;
    let result;
    let settled = false;
    const settle = (code, signal, startupError) => {
      if (settled) return;
      settled = true;
      active.delete(job);
      record.finishedAt = new Date().toISOString();
      record.exitCode = code;
      record.signal = signal;
      if (!startupError && code === 0 && result?.ok) {
        record.status = job.options.preflightOnly ? 'preflight_passed' : 'completed';
      } else {
        const interruptedBy = result?.interruptedBy || stopSignal;
        record.status = interruptedBy ? 'interrupted' : 'failed';
        record.error =
          startupError?.message ||
          result?.error ||
          `Worker exited with ${signal || code}. See ${record.stderrLog}`;
        if (interruptedBy) record.interruptedBy = interruptedBy;
        const error = new Error(`${job.id}: ${record.error}`);
        if (interruptedBy) {
          error.interruptedBy = interruptedBy;
          error.exitCode = interruptedBy === 'SIGINT' ? 130 : 143;
        }
        stop(error);
      }
      update(record);
      schedule();
    };
    try {
      beforeStart(job);
      stdout = openSync(record.stdoutLog, 'wx');
      stderr = openSync(record.stderrLog, 'wx');
      child = fork(workerPath, [], {
        cwd: job.options.source,
        env: environment,
        execArgv: [],
        detached: process.platform !== 'win32',
        stdio: ['ignore', stdout, stderr, 'ipc'],
      });
      active.set(job, { child });
      record.status = 'running';
      record.startedAt = new Date().toISOString();
      record.pid = child.pid;
      update(record);
      child.on('message', (message) => {
        if (message.type === 'ready') {
          send(
            child,
            stopSignal
              ? { type: 'cancel', signal: stopSignal }
              : { type: 'run', options: job.options },
          );
        } else if (message.type === 'result') result = message;
      });
      child.once('error', (error) => settle(null, null, error));
      child.once('close', (code, signal) => settle(code, signal));
    } catch (error) {
      settle(null, null, error);
    } finally {
      if (stdout !== undefined) closeSync(stdout);
      if (stderr !== undefined) closeSync(stderr);
    }
  };
  function schedule() {
    while (!failure && active.size < concurrency && next < jobs.length) launch(jobs[next++]);
    if (!active.size && (failure || next === jobs.length)) resolveFinished();
  }
  try {
    schedule();
    await finished;
    if (failure) throw failure;
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  }
}
