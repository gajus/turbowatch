import { generateShortId } from './generateShortId';
import { Logger } from './Logger';
import { subscribe } from './subscribe';
import { testExpression } from './testExpression';
import {
  type ChokidarEvent,
  type Configuration,
  type ConfigurationInput,
  type JsonObject,
  type Subscription,
  type TurbowatchController,
} from './types';
import * as chokidar from 'chokidar';
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
  }: Configuration = {
    // as far as I can tell, this is a bug in unicorn/no-unused-properties
    // https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2051
    // eslint-disable-next-line unicorn/no-unused-properties
    debounce: {
      wait: 1_000,
    },
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
  }, 1_000);

  const subscriptions: Subscription[] = [];

  const watcher = chokidar.watch(project);

  const shutdown = async () => {
    clearInterval(indexingIntervalId);

    abortController.abort();

    for (const subscription of subscriptions) {
      const { activeTask } = subscription;

      if (activeTask?.promise) {
        await activeTask?.promise;
      }
    }

    // eslint-disable-next-line promise/prefer-await-to-then
    await watcher.close();
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
        retry: trigger.retry ?? {
          retries: 0,
        },
        throttleOutput: trigger.throttleOutput ?? { delay: 1_000 },
      }),
    );
  }

  let queuedChokidarEvents: ChokidarEvent[] = [];

  const evaluateSubscribers = debounce(
    userDebounce.wait,
    () => {
      const currentChokidarEvents =
        queuedChokidarEvents as readonly ChokidarEvent[];

      queuedChokidarEvents = [];

      for (const subscription of subscriptions) {
        const relevantEvents = currentChokidarEvents.filter((chokidarEvent) => {
          return testExpression(subscription.expression, chokidarEvent.path);
        });

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

  watcher.on('all', (event, path) => {
    if (ready) {
      queuedChokidarEvents.push({
        event,
        path,
      });

      evaluateSubscribers();
    } else {
      if (discoveredFiles.length < 10) {
        discoveredFiles.push(path);
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
      } else {
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
