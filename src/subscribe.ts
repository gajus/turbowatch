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

    let abortController: AbortController | null = null;

    if (trigger.interruptible) {
      abortController = new AbortController();
    }

    let abortSignal = abortController?.signal;

    if (abortSignal && trigger.abortSignal) {
      trigger.abortSignal.addEventListener('abort', () => {
        abortController?.abort();
      });
    } else if (trigger.abortSignal) {
      abortSignal = trigger.abortSignal;
    }

    if (activeTask) {
      if (trigger.interruptible) {
        log.warn('%s (%s): aborted task', trigger.name, activeTask.id);

        if (!activeTask.abortController) {
          throw new Error('Expected abort controller to be set');
        }

        activeTask.abortController.abort();

        activeTask = null;
      } else {
        if (trigger.persistent) {
          log.warn(
            '%s (%s): ignoring event because the trigger is persistent',
            trigger.name,
            activeTask.id,
          );

          return undefined;
        }

        log.warn(
          '%s (%s): waiting for task to complete',
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

    const taskId = generateShortId();

    if (trigger.initialRun && currentFirst) {
      log.debug('%s (%s): initial run...', trigger.name, taskId);
    } else if (event.files.length > 10) {
      log.debug(
        {
          files: event.files.slice(0, 10).map((file) => {
            return file.name;
          }),
        },
        '%s (%s): %d files changed; showing first 10',
        trigger.name,
        taskId,
        event.files.length,
      );
    } else {
      log.debug(
        {
          files: event.files.map((file) => {
            return file.name;
          }),
        },
        '%s (%s): %d %s changed',
        trigger.name,
        taskId,
        event.files.length,
        event.files.length === 1 ? 'file' : 'files',
      );
    }

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
            log.warn(
              '%s (%s): retrying task %d/%d...',
              trigger.name,
              taskId,
              trigger.retry.retries - retriesLeft,
              trigger.retry.retries,
            );
          }
        },
      },
    )
      // eslint-disable-next-line promise/prefer-await-to-then
      .then(() => {
        if (taskId === activeTask?.id) {
          log.debug('%s (%s): completed task', trigger.name, taskId);

          activeTask = null;
        }
      })
      // eslint-disable-next-line promise/prefer-await-to-then
      .catch(() => {
        log.warn('%s (%s): task failed', trigger.name, taskId);
      });

    // eslint-disable-next-line require-atomic-updates
    activeTask = {
      abortController,
      id: taskId,
      promise: taskPromise,
      queued: false,
    };

    log.debug('%s (%s): started task', trigger.name, taskId);

    return taskPromise;
  };

  return {
    activeTask,
    expression: trigger.expression,
    initialRun: trigger.initialRun,
    persistent: trigger.persistent,
    teardown: async () => {
      if (trigger.onTeardown) {
        const taskId = generateShortId();

        try {
          await trigger.onTeardown({
            spawn: createSpawn(taskId, {
              throttleOutput: trigger.throttleOutput,
            }),
          });
        } catch (error) {
          log.error(
            {
              error,
            },
            'teardown produced an error',
          );
        }
      }
    },
    trigger: async (events: readonly FileChangeEvent[]) => {
      fileChangeEventQueue.push(...events);

      try {
        await handleSubscriptionEvent();
      } catch (error) {
        log.error(
          {
            error,
          },
          'trigger produced an error',
        );
      }
    },
  };
};
