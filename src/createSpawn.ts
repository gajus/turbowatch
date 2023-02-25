// cspell:words nothrow

import {
  Logger,
} from './Logger';
import {
  $,
} from 'zx';

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

export const createSpawn = (taskId: string, triggerSignal: AbortSignal | null) => {
  return async (pieces: TemplateStringsArray, ...args: any[]) => {
    // eslint-disable-next-line promise/prefer-await-to-then
    const processPromise = $(pieces, ...args).nothrow().quiet();

    (async () => {
      for await (const chunk of processPromise.stdout) {
        // eslint-disable-next-line no-console
        console.log(prefixLines(chunk.toString(), taskId + ' > '));
      }
    })();

    (async () => {
      for await (const chunk of processPromise.stderr) {
        // eslint-disable-next-line no-console
        console.error(prefixLines(chunk.toString(), taskId + ' > '));
      }
    })();

    if (triggerSignal) {
      const kill = () => {
        processPromise.kill();
      };

      triggerSignal.addEventListener('abort', kill, {
        once: true,
      });

      // eslint-disable-next-line promise/prefer-await-to-then
      processPromise.finally(() => {
        triggerSignal.removeEventListener('abort', kill);
      });
    }

    const result = await processPromise;

    if (result.exitCode === 0) {
      return result;
    }

    log.error('task %s exited with an error', taskId);

    throw new Error('Program exited with code ' + result.exitCode + '.');
  };
};
