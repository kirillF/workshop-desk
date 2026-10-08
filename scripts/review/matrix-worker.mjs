import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReview } from './run.mjs';

// A worker owns one review. Its fresh process loads only the frozen harness.
export function startMatrixWorker(execute = runReview) {
  const controller = new AbortController();
  let started = false;
  let finished = false;
  const finish = (result) => {
    if (finished) return;
    finished = true;
    process.exitCode = result.exitCode || 0;
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
    process.off('disconnect', onDisconnect);
    process.off('message', onMessage);
    if (process.connected) {
      process.send({ type: 'result', ...result }, () => {
        if (process.connected) process.disconnect();
      });
    }
  };
  const cancel = (signal) => {
    controller.abort(signal);
    if (!started)
      finish({ ok: false, interruptedBy: signal, exitCode: signal === 'SIGINT' ? 130 : 143 });
  };
  const onInterrupt = () => cancel('SIGINT');
  const onTerminate = () => cancel('SIGTERM');
  const onDisconnect = () => cancel('SIGTERM');
  const onMessage = async (message) => {
    if (message.type === 'cancel') return cancel(message.signal);
    if (message.type !== 'run' || started || finished) return;
    started = true;
    try {
      await execute({ ...message.options, signal: controller.signal });
      if (controller.signal.aborted) {
        finish({
          ok: false,
          interruptedBy: controller.signal.reason,
          exitCode: controller.signal.reason === 'SIGINT' ? 130 : 143,
        });
      } else finish({ ok: true });
    } catch (error) {
      console.error(error.message);
      const interruptedBy =
        error.interruptedBy || (controller.signal.aborted ? controller.signal.reason : null);
      finish({
        ok: false,
        error: error.message,
        interruptedBy,
        exitCode: error.exitCode || (interruptedBy === 'SIGINT' ? 130 : interruptedBy ? 143 : 1),
      });
    }
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  process.on('disconnect', onDisconnect);
  process.on('message', onMessage);
  process.send({ type: 'ready' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  startMatrixWorker();
