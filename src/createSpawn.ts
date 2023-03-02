// cspell:words nothrow

import { Logger } from './Logger';
import { $ } from 'zx';

const log = Logger.child({
  namespace: 'createSpawn',
});

const prefixLines = (subject: string, prefix: string): string => {
  const response: string[] = [];

  for (const fragment of subject.split('\n')) {
    response.push(prefix + fragment);
  }

  return response.join('\n');
};

export const createSpawn = (
  taskId: string,
  { abortSignal }: { abortSignal?: AbortSignal } = {},
) => {
  return async (pieces: TemplateStringsArray, ...args: any[]) => {
    // eslint-disable-next-line promise/prefer-await-to-then
    const processPromise = $(pieces, ...args)
      .nothrow()
      .quiet();

    (async () => {
      for await (const chunk of processPromise.stdout) {
        // eslint-disable-next-line no-console
        console.log(prefixLines(chunk.toString().trimEnd(), taskId + ' > '));
      }
    })();

    (async () => {
      for await (const chunk of processPromise.stderr) {
        // eslint-disable-next-line no-console
        console.error(prefixLines(chunk.toString().trimEnd(), taskId + ' > '));
      }
    })();

    if (abortSignal) {
      const kill = () => {
        processPromise.kill();
      };

      abortSignal.addEventListener('abort', kill, {
        once: true,
      });

      // eslint-disable-next-line promise/prefer-await-to-then
      processPromise.finally(() => {
        abortSignal.removeEventListener('abort', kill);
      });
    }

    const result = await processPromise;

    if (result.exitCode === 0) {
      return result;
    }

    if (abortSignal?.aborted) {
      return result;
    }

    log.error('task %s exited with an error', taskId);

    throw new Error('Program exited with code ' + result.exitCode + '.');
  };
};
