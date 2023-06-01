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
  let teardownInitiated = false;

  let activeTask: ActiveTask | null = null;

  /**
   * Identifies the first event in a series of events.
   */
  let outerFirstEvent = true;

  /**
   * Stores the files that have changed since the last evaluation of the trigger
   */
  let outerChangedFiles: string[] = [];

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

  const handleSubscriptionEvent = async () => {
    let firstEvent = outerFirstEvent;

    if (outerFirstEvent) {
      firstEvent = true;
      outerFirstEvent = false;
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

    if (teardownInitiated) {
      log.warn('teardown already initiated');

      return undefined;
    }

    const changedFiles = outerChangedFiles;

    outerChangedFiles = [];

    const taskId = generateShortId();

    if (trigger.initialRun && firstEvent) {
      log.debug('%s (%s): initial run...', trigger.name, taskId);
    } else if (changedFiles.length > 10) {
      log.debug(
        {
          files: changedFiles.slice(0, 10),
        },
        '%s (%s): %d files changed; showing first 10',
        trigger.name,
        taskId,
        changedFiles.length,
      );
    } else {
      log.debug(
        {
          files: changedFiles,
        },
        '%s (%s): %d %s changed',
        trigger.name,
        taskId,
        changedFiles.length,
        changedFiles.length === 1 ? 'file' : 'files',
      );
    }

    const taskPromise = retry(
      (attempt: number) => {
        return trigger.onChange({
          abortSignal,
          attempt,
          files: changedFiles.map((changedFile) => {
            return {
              name: changedFile,
            };
          }),
          first: firstEvent,
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
          if (retriesLeft === 0) {
            log.warn(
              '%s (%s): task will not be retried; attempts exhausted',
              trigger.name,
              taskId,
            );
          }

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
      if (teardownInitiated) {
        log.warn('teardown already initiated');

        return;
      }

      teardownInitiated = true;

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
      for (const event of events) {
        if (outerChangedFiles.includes(event.filename)) {
          continue;
        }

        outerChangedFiles.push(event.filename);
      }

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
