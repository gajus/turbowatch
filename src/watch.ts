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
} from './types';
import * as chokidar from 'chokidar';
import { serializeError } from 'serialize-error';
import { debounce } from 'throttle-debounce';

const log = Logger.child({
  namespace: 'watch',
});

export const watch = (configurationInput: ConfigurationInput) => {
  const {
    project,
    triggers,
    abortSignal: userAbortSignal,
    debounce: userDebounce,
    onReady,
  }: Configuration = {
    // as far as I can tell, this is a bug in unicorn/no-unused-properties
    // eslint-disable-next-line unicorn/no-unused-properties
    debounce: {
      wait: 1_000,
    },
    ...configurationInput,
  };

  let abortSignal = userAbortSignal;

  if (!abortSignal) {
    log.debug('binding graceful shutdown to SIGINT');

    const abortController = new AbortController();

    process.once('SIGINT', () => {
      log.warn('received SIGINT; gracefully terminating');

      abortController.abort();
    });

    abortSignal = abortController.signal;
  }

  return new Promise((resolve, reject) => {
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

    const close = async () => {
      clearInterval(indexingIntervalId);

      for (const subscription of subscriptions) {
        const { activeTask } = subscription;

        if (activeTask?.promise) {
          await activeTask?.promise;
        }
      }

      // eslint-disable-next-line promise/prefer-await-to-then
      await watcher.close().then(resolve).catch(reject);
    };

    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          close();
        },
        {
          once: true,
        },
      );
    }

    watcher.on('error', (error) => {
      log.error(
        {
          error: serializeError(error) as unknown as JsonObject,
        },
        'could not watch project',
      );

      close();
    });

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
          const relevantEvents = currentChokidarEvents.filter(
            (chokidarEvent) => {
              return testExpression(
                subscription.expression,
                chokidarEvent.path,
              );
            },
          );

          if (relevantEvents.length) {
            subscription.trigger(relevantEvents);
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

      if (onReady) {
        onReady();
      }
    });

    for (const subscription of subscriptions) {
      if (subscription.initialRun) {
        subscription.trigger([]);
      }
    }
  });
};
