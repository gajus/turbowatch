import { createSpawn } from './createSpawn';
import { generateShortId } from './generateShortId';
import { Logger } from './Logger';
import {
  type ActiveTask,
  type FileChangeEvent,
  type Subscription,
  type Trigger,
} from './types';
import retry from 'p-retry';

const log = Logger.child({
  namespace: 'subscribe',
});

export const subscribe = (trigger: Trigger): Subscription => {
  let activeTask: ActiveTask | null = null;

  let first = true;

  let fileChangeEventQueue: FileChangeEvent[] = [];

  const handleSubscriptionEvent = async () => {
    let currentFirst = first;

    if (first) {
      currentFirst = true;
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
        if (trigger.persistent) {
          log.warn('ignoring event because the trigger is persistent');

          return undefined;
        }

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

    const affectedPaths: string[] = [];

    const event = {
      files: fileChangeEventQueue
        .filter(({ filename }) => {
          if (affectedPaths.includes(filename)) {
            return false;
          }

          affectedPaths.push(filename);
          return true;
        })
        .map(({ filename }) => {
          return {
            name: filename,
          };
        }),
    };

    fileChangeEventQueue = [];

    if (trigger.initialRun && currentFirst) {
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
        '%d %s changed',
        event.files.length,
        event.files.length === 1 ? 'file' : 'files',
      );
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
          first: currentFirst,
          log,
          spawn: createSpawn(taskId, {
            abortSignal,
            cwd: trigger.cwd,
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
      })
      // eslint-disable-next-line promise/prefer-await-to-then
      .catch(() => {
        log.warn('task %s (%s) failed', trigger.name, taskId);
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
    trigger: async (events: readonly FileChangeEvent[]) => {
      fileChangeEventQueue.push(...events);

      await handleSubscriptionEvent();
    },
  };
};
