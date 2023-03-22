// cspell:words nothrow

import { Logger } from './Logger';
import { type Throttle } from './types';
import chalk from 'chalk';
import randomColor from 'randomcolor';
import { throttle } from 'throttle-debounce';
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
  {
    cwd = process.cwd(),
    abortSignal,
    throttleOutput,
  }: {
    abortSignal?: AbortSignal;
    cwd?: string;
    throttleOutput?: Throttle;
  } = {},
) => {
  let stdoutBuffer: string[] = [];
  let stderrBuffer: string[] = [];

  const flush = () => {
    if (stdoutBuffer.length) {
      // eslint-disable-next-line no-console
      console.log(stdoutBuffer.join('\n'));
    }

    if (stderrBuffer.length) {
      // eslint-disable-next-line no-console
      console.error(stderrBuffer.join('\n'));
    }

    stdoutBuffer = [];
    stderrBuffer = [];
  };

  const output = throttle(
    throttleOutput?.delay,
    () => {
      flush();
    },
    {
      noLeading: true,
    },
  );

  const colorText = chalk.hex(randomColor({ luminosity: 'dark' }));

  return async (pieces: TemplateStringsArray, ...args: any[]) => {
    $.cwd = cwd;

    // eslint-disable-next-line promise/prefer-await-to-then
    const processPromise = $(pieces, ...args)
      .nothrow()
      .quiet();

    (async () => {
      for await (const chunk of processPromise.stdout) {
        // TODO we might want to make this configurable (e.g. behind a debug flag), because these logs might provide valuable context when debugging shutdown logic.
        if (abortSignal?.aborted) {
          return;
        }

        const message = prefixLines(
          chunk.toString().trimEnd(),
          colorText(taskId) + ' > ',
        );

        if (throttleOutput?.delay) {
          stdoutBuffer.push(message);

          output();
        } else {
          // eslint-disable-next-line no-console
          console.log(message);
        }
      }
    })();

    (async () => {
      for await (const chunk of processPromise.stderr) {
        // TODO we might want to make this configurable (e.g. behind a debug flag), because these logs might provide valuable context when debugging shutdown logic.
        if (abortSignal?.aborted) {
          return;
        }

        const message = prefixLines(
          chunk.toString().trimEnd(),
          colorText(taskId) + ' > ',
        );

        if (throttleOutput?.delay) {
          stderrBuffer.push(message);

          output();
        } else {
          // eslint-disable-next-line no-console
          console.error(message);
        }
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

    flush();

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
