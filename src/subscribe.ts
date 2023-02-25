import {
  createSpawn,
} from './createSpawn';
import {
  Logger,
} from './Logger';
import {
  type Trigger,
  type WatchmanClient,
} from './types';
import {
  randomUUID,
} from 'crypto';
import path from 'node:path';
import retry from 'p-retry';

const log = Logger.child({
  namespace: 'subscribe',
});

type WatchmanEvent = {
  version: string,
};

export const subscribe = (
  client: WatchmanClient,
  trigger: Trigger,
  signal?: AbortSignal,
) => {
  return new Promise((resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => {
        resolve(null);
      },
      {
        once: true,
      },
    );

    client.command(
      [
        'subscribe',
        trigger.watch,
        trigger.id,
        {
          expression: trigger.expression,
          fields: [
            'name',
            'size',
            'mtime_ms',
            'exists',
            'type',
          ],
          relative_path: trigger.relativePath,
        },
      ],
      (error, response: WatchmanEvent & { subscribe: string, }) => {
        if (error) {
          reject(error);

          return;
        }

        log.info('subscription %s established', response.subscribe);
      },
    );

    /**
     * @property queued Indicates that a follow action has been queued.
     */
    type ActiveTask = {
      abortController: AbortController | null,
      id: string,
      promise: Promise<unknown>,
      queued: boolean,
    };

    let activeTask: ActiveTask | null = null;

    let first = true;

    client.on('subscription', async (event) => {
      if (event.subscription !== trigger.id) {
        return;
      }

      let reportFirst = first;

      if (first) {
        reportFirst = true;
        first = false;
      }

      let controller: AbortController | null = null;

      if (trigger.interruptible) {
        controller = new AbortController();
      }

      if (activeTask) {
        if (trigger.interruptible) {
          log.warn('aborted task %s', activeTask.id);

          if (!activeTask.abortController) {
            throw new Error('Expected abort controller to be set');
          }

          activeTask.abortController.abort();

          activeTask = null;
        } else {
          log.warn('waiting for %s task to complete', activeTask.id);

          if (activeTask.queued) {
            return;
          }

          activeTask.queued = true;

          try {
            await activeTask.promise;
          } catch {
            // nothing to do
          }
        }
      }

      const taskId = randomUUID();

      const triggerSignal = controller?.signal ?? null;

      const onChange = (attempt: number) => {
        return trigger.onChange({
          attempt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          files: event.files.map((file: any) => {
            return {
              exists: file.exists,
              mtime: file.mtime_ms,
              name: path.join(event.root, file.name),
              size: file.size,
            };
          }),
          first: reportFirst,
          signal: triggerSignal,
          spawn: createSpawn(taskId, triggerSignal),
          warning: event.warning ?? null,
        });
      };

      const taskPromise = retry(onChange, {
        ...trigger.retry,
        onFailedAttempt: () => {
          log.warn('retrying task %s...', taskId);
        },
      })
        // eslint-disable-next-line promise/prefer-await-to-then
        .then(() => {
          if (taskId === activeTask?.id) {
            log.trace('completed task %s', activeTask.id);

            activeTask = null;
          }
        })
        // eslint-disable-next-line promise/prefer-await-to-then
        .catch((error) => {
          reject(error);
        });

      // eslint-disable-next-line require-atomic-updates
      activeTask = {
        abortController: controller,
        id: taskId,
        promise: taskPromise,
        queued: false,
      };

      log.trace('started task %s', activeTask.id);
    });
  });
};
