import { generateShortId } from './generateShortId';
import { Logger } from './Logger';
import { subscribe } from './subscribe';
import {
  type Configuration,
  type ConfigurationInput,
  type JsonObject,
} from './types';
import { Client } from 'fb-watchman';
import { serializeError } from 'serialize-error';

const log = Logger.child({
  namespace: 'watch',
});

export const watch = (configurationInput: ConfigurationInput) => {
  const {
    project,
    triggers,
    abortSignal: userAbortSignal,
  }: Configuration = {
    ...configurationInput,
  };

  let abortSignal = userAbortSignal;

  if (!abortSignal) {
    log.warn('binding graceful shutdown to SIGINT');

    const abortController = new AbortController();

    process.once('SIGINT', () => {
      log.warn('received SIGINT; gracefully terminating');

      abortController.abort();
    });

    abortSignal = abortController.signal;
  }

  const client = new Client();

  return new Promise((resolve, reject) => {
    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          client.end();
        },
        {
          once: true,
        },
      );
    }

    client.command(['watch-project', project], (error, response) => {
      if (error) {
        log.error(
          {
            error: serializeError(error) as unknown as JsonObject,
          },
          'could not watch project',
        );

        reject(error);

        client.end();

        return;
      }

      if ('warning' in response) {
        // eslint-disable-next-line no-console
        console.warn(response.warning);
      }

      log.info(
        'watch established on %s relative_path %s',
        response.watch,
        response.relative_path,
      );

      const subscriptions: Array<Promise<void>> = [];

      for (const trigger of triggers) {
        subscriptions.push(
          subscribe(client, {
            abortSignal,
            debounce: trigger.debounce,
            expression: trigger.expression,
            id: generateShortId(),
            interruptible: trigger.interruptible ?? true,
            name: trigger.name,
            onChange: trigger.onChange,
            onTeardown: trigger.onTeardown,
            relativePath: response.relative_path,
            retry: trigger.retry ?? {
              factor: 2,
              maxTimeout: Number.POSITIVE_INFINITY,
              minTimeout: 1_000,
              retries: 10,
            },
            throttleOutput: trigger.throttleOutput ?? { delay: 1_000 },
            watch: response.watch,
          }),
        );
      }

      // eslint-disable-next-line promise/prefer-await-to-then
      Promise.all(subscriptions).then(resolve).catch(reject);
    });
  });
};
