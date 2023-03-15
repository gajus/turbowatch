import { createSpawn } from './createSpawn';
import { generateShortId } from './generateShortId';
import { Logger } from './Logger';
import {
  type ActiveTask,
  type ChokidarEvent,
  type Subscription,
  type SubscriptionEvent,
  type Trigger,
} from './types';
import retry from 'p-retry';

const log = Logger.child({
  namespace: 'subscribe',
});

export const subscribe = (trigger: Trigger): Subscription => {
  let activeTask: ActiveTask | null = null;

  let first = true;

  const handleSubscriptionEvent = async (event: SubscriptionEvent) => {
    if (trigger.abortSignal?.aborted) {
      log.warn('ignoring event because Turbowatch is shutting down');

      return undefined;
    }

    if (trigger.initialRun && first) {
      log.trace('initial run...');
    } else if (event.files.length > 10) {
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

    let abortSignal = controller?.signal;

    if (abortSignal && trigger.abortSignal) {
      trigger.abortSignal.addEventListener('abort', () => {
        controller?.abort();
      });
    } else if (trigger.abortSignal) {
      abortSignal = trigger.abortSignal;
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
          return undefined;
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
          abortSignal,
          attempt,
          files: event.files.map((file) => {
            return {
              name: file.name,
            };
          }),
          first: reportFirst,
          spawn: createSpawn(taskId, {
            abortSignal,
            throttleOutput: trigger.throttleOutput,
          }),
          taskId,
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
      });

    // eslint-disable-next-line require-atomic-updates
    activeTask = {
      abortController: controller,
      id: taskId,
      promise: taskPromise,
      queued: false,
    };

    log.trace('started task %s (%s)', trigger.name, taskId);

    return taskPromise;
  };

  return {
    activeTask,
    expression: trigger.expression,
    initialRun: trigger.initialRun,
    teardown: async () => {
      if (trigger.onTeardown) {
        const taskId = generateShortId();

        await trigger.onTeardown({
          spawn: createSpawn(taskId, {
            throttleOutput: trigger.throttleOutput,
          }),
        });
      }
    },
    trigger: async (events: readonly ChokidarEvent[]) => {
      await handleSubscriptionEvent({
        files: events.map((event) => {
          return {
            name: event.path,
          };
        }),
      });
    },
  };
};
