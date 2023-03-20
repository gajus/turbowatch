import { TurboWatcher } from './backends/TurboWatcher';
import { generateShortId } from './generateShortId';
import { Logger } from './Logger';
import { subscribe } from './subscribe';
import { testExpression } from './testExpression';
import {
  type Configuration,
  type ConfigurationInput,
  type FileChangeEvent,
  type JsonObject,
  type Subscription,
  type TurbowatchController,
} from './types';
import { serializeError } from 'serialize-error';
import { debounce } from 'throttle-debounce';

const log = Logger.child({
  namespace: 'watch',
});

export const watch = (
  configurationInput: ConfigurationInput,
): Promise<TurbowatchController> => {
  const {
    project,
    triggers,
    debounce: userDebounce,
    Watcher,
  }: Configuration = {
    // as far as I can tell, this is a bug in unicorn/no-unused-properties
    // https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2051
    // eslint-disable-next-line unicorn/no-unused-properties
    debounce: {
      wait: 1_000,
    },

    // eslint-disable-next-line unicorn/no-unused-properties
    Watcher: TurboWatcher,
    ...configurationInput,
  };

  const abortController = new AbortController();

  const abortSignal = abortController.signal;

  let discoveredFileCount = 0;

  const indexingIntervalId = setInterval(() => {
    log.trace(
      'indexed %d %s...',
      discoveredFileCount,
      discoveredFileCount === 1 ? 'file' : 'files',
    );
  }, 5_000);

  const subscriptions: Subscription[] = [];

  const watcher = new Watcher(project);

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    // eslint-disable-next-line promise/prefer-await-to-then
    await watcher.close();

    clearInterval(indexingIntervalId);

    abortController.abort();

    for (const subscription of subscriptions) {
      const { activeTask } = subscription;

      if (activeTask?.promise) {
        await activeTask?.promise;
      }
    }

    for (const subscription of subscriptions) {
      const { teardown } = subscription;

      if (teardown) {
        await teardown();
      }
    }
  };

  if (abortSignal) {
    abortSignal.addEventListener(
      'abort',
      () => {
        shutdown();
      },
      {
        once: true,
      },
    );
  }

  for (const trigger of triggers) {
    subscriptions.push(
      subscribe({
        abortSignal,
        expression: trigger.expression,
        id: generateShortId(),
        initialRun: trigger.initialRun ?? true,
        interruptible: trigger.interruptible ?? true,
        name: trigger.name,
        onChange: trigger.onChange,
        onTeardown: trigger.onTeardown,
        persistent: trigger.persistent ?? false,
        retry: trigger.retry ?? {
          retries: 0,
        },
        throttleOutput: trigger.throttleOutput ?? { delay: 1_000 },
      }),
    );
  }

  let queuedFileChangeEvents: FileChangeEvent[] = [];

  const evaluateSubscribers = debounce(
    userDebounce.wait,
    () => {
      const currentFileChangeEvents =
        queuedFileChangeEvents as readonly FileChangeEvent[];

      queuedFileChangeEvents = [];

      for (const subscription of subscriptions) {
        const relevantEvents = currentFileChangeEvents.filter(
          (fileChangeEvent) => {
            return testExpression(
              subscription.expression,
              fileChangeEvent.filename,
            );
          },
        );

        if (relevantEvents.length) {
          void subscription.trigger(relevantEvents);
        }
      }
    },
    {
      noLeading: true,
    },
  );

  let ready = false;

  const discoveredFiles: string[] = [];

  watcher.on('change', ({ filename }) => {
    if (ready) {
      queuedFileChangeEvents.push({
        filename,
      });

      evaluateSubscribers();
    } else {
      if (discoveredFiles.length < 10) {
        discoveredFiles.push(filename);
      }

      discoveredFileCount++;
    }
  });

  return new Promise((resolve, reject) => {
    watcher.on('error', (error) => {
      log.error(
        {
          error: serializeError(error) as unknown as JsonObject,
        },
        'could not watch project',
      );

      if (ready) {
        shutdown();
      } else {
        reject(error);
      }
    });

    watcher.on('ready', () => {
      ready = true;

      clearInterval(indexingIntervalId);

      if (discoveredFiles.length > 10) {
        log.trace(
          {
            files: discoveredFiles.slice(0, 10).map((file) => {
              return file;
            }),
          },
          'discovered %d files in %s; showing first 10',
          discoveredFileCount,
          project,
        );
      } else if (discoveredFiles.length > 0) {
        log.trace(
          {
            files: discoveredFiles.map((file) => {
              return file;
            }),
          },
          'discovered %d %s in %s',
          discoveredFileCount,
          discoveredFiles.length === 1 ? 'file' : 'files',
          project,
        );
      }

      log.info('Initial scan complete. Ready for changes');

      for (const subscription of subscriptions) {
        if (subscription.initialRun) {
          void subscription.trigger([]);
        }
      }

      resolve({
        shutdown,
      });
    });
  });
};
