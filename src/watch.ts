import {
  Logger,
} from './Logger';
import {
  subscribe,
} from './subscribe';
import {
  type Configuration,
  type ConfigurationInput,
  type JsonObject,
} from './types';
import {
  randomUUID,
} from 'crypto';
import {
  Client,
} from 'fb-watchman';
import {
  serializeError,
} from 'serialize-error';

const log = Logger.child({
  namespace: 'watch',
});

export const watch = (configurationInput: ConfigurationInput) => {
  const {
    project,
    triggers,
  }: Configuration = {
    ...configurationInput,
  };

  const client = new Client();

  return new Promise((resolve, reject) => {
    client.command([
      'watch-project',
      project,
    ], (error, response) => {
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

      const subscriptions: Array<Promise<unknown>> = [];

      for (const trigger of triggers) {
        subscriptions.push(
          subscribe(client, {
            expression: trigger.expression,
            id: randomUUID(),
            interruptible: trigger.interruptible ?? true,
            onChange: trigger.onChange,
            relativePath: response.relative_path,
            watch: response.watch,
          }),
        );
      }

      // eslint-disable-next-line promise/prefer-await-to-then
      Promise.all(subscriptions).then(resolve).catch(reject);
    });
  });
};
