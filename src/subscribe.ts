import { createSpawn } from './createSpawn';
import { generateShortId } from './generateShortId';
import { Logger } from './Logger';
import { type Trigger, type WatchmanClient } from './types';
import path from 'node:path';
import retry from 'p-retry';
import { debounce } from 'throttle-debounce';

const log = Logger.child({
  namespace: 'subscribe',
});

type WatchmanEvent = {
  version: string;
};

type SubscriptionEvent = {
  files: Array<{ name: string }>;
  root: string;
  subscription: string;
  warning?: string;
};

export const subscribe = (
  client: WatchmanClient,
  trigger: Trigger,
  abortSignal?: AbortSignal,
) => {
  return new Promise((resolve, reject) => {
    abortSignal?.addEventListener(
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
          fields: ['name', 'size', 'mtime_ms', 'exists', 'type'],
          relative_root: trigger.relativePath,
        },
      ],
      (error, response: WatchmanEvent & { subscribe: string }) => {
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
      abortController: AbortController | null;
      id: string;
      promise: Promise<unknown>;
      queued: boolean;
    };

    let activeTask: ActiveTask | null = null;

    let first = true;

    let handleSubscriptionEvent = async (event: SubscriptionEvent) => {
      if (event.files.length > 10) {
        log.trace(
          {
            files: event.files.slice(0, 10).map((file) => {
              return file.name;
            }),
          },
          '%d files changed; showing first 10',
          event.files.length,
        );
      } else {
        log.trace(
          {
            files: event.files.map((file) => {
              return file.name;
            }),
          },
          '%d files changed',
          event.files.length,
        );
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
          log.warn('aborted task %s (%s)', trigger.name, activeTask.id);

          if (!activeTask.abortController) {
            throw new Error('Expected abort controller to be set');
          }

          activeTask.abortController.abort();

          activeTask = null;
        } else {
          log.warn(
            'waiting for %s (%s) task to complete',
            trigger.name,
            activeTask.id,
          );

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

      const taskId = generateShortId();

      const taskPromise = retry(
        (attempt: number) => {
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
            signal: controller?.signal ?? null,
            spawn: createSpawn(taskId, {
              abortSignal: controller?.signal,
              throttleOutput: trigger.throttleOutput,
            }),
            taskId,
            warning: event.warning ?? null,
          });
        },
        {
          ...trigger.retry,
          onFailedAttempt: ({ retriesLeft }) => {
            if (retriesLeft > 0) {
              log.warn('retrying task %s (%s)...', trigger.name, taskId);
            }
          },
        },
      )
        // eslint-disable-next-line promise/prefer-await-to-then
        .then(() => {
          if (taskId === activeTask?.id) {
            log.trace('completed task %s (%s)', trigger.name, taskId);

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

      log.trace('started task %s (%s)', trigger.name, taskId);
    };

    if (trigger.debounce) {
      handleSubscriptionEvent = debounce(
        trigger.debounce.wait,
        handleSubscriptionEvent,
        {
          atBegin: trigger.debounce.leading,
        },
      );
    }

    client.on('subscription', async (event: SubscriptionEvent) => {
      if (event.subscription !== trigger.id) {
        return;
      }

      handleSubscriptionEvent(event);
    });
  });
};
